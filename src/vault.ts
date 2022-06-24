import {
  workspace,
  Uri,
  SecretStorage,
  EventEmitter,
  EnvironmentVariableCollection,
  ConfigurationTarget,
} from "vscode";
import { Collection, Secret } from "./tree";

export interface Secrets {
  [collection: string]: {
    [key: string]: string;
  };
}
export class Vault {
  private readonly storage: SecretStorage;
  private readonly windowEnv: EnvironmentVariableCollection;
  private static readonly storageKey = "secrets";

  private secrets: Secrets = {};
  private enabledCollections: string[] = [];

  private _onChange: EventEmitter<void> = new EventEmitter();
  readonly onChange = this._onChange.event;

  public getActiveSecrets(): Record<string, Secret> {
    const activeSecrets: Record<string, Secret> = {};
    for (const context of this.enabledCollections) {
      for (const key of Object.keys(this.secrets[context] || {})) {
        activeSecrets[key] = { key, collection: context };
      }
    }

    return activeSecrets;
  }

  public static async create(
    storage: SecretStorage,
    env: EnvironmentVariableCollection
  ): Promise<Vault> {
    const vault = new Vault(storage, env);

    await vault.load();
    await vault.loadEnabledCollections();
    await vault.refresh();

    storage.onDidChange(async (e) => {
      if (e.key === Vault.storageKey) {
        vault.load();
        vault.refresh();
      }
    });

    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${this.storageKey}.enabledCollections`)) {
        vault.loadEnabledCollections();
        vault.refresh();
      }
    });

    return vault;
  }

  public async load() {
    const content = await this.storage.get(Vault.storageKey);
    this.secrets = content
      ? JSON.parse(content)
      : {
          default: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            SECRET_NAME: "secret_value",
          },
        };
  }

  public async loadEnabledCollections() {
    this.enabledCollections = workspace
      .getConfiguration(Vault.storageKey)
      .get("enabledCollections", ["default"]);
  }

  public constructor(
    storage: SecretStorage,
    env: EnvironmentVariableCollection
  ) {
    this.storage = storage;
    this.windowEnv = env;
  }

  public async refresh() {
    const activeSecrets = this.getActiveSecrets();

    // Clean up secrets that are not in the active collections
    this.windowEnv.forEach((key) => {
      if (!activeSecrets[key]) {
        this.windowEnv.delete(key);
      }
    });

    // Add new secrets
    for (const [key, secret] of Object.entries(activeSecrets)) {
      this.windowEnv.replace(key, this.get(secret) as string);
    }

    this._onChange.fire();
  }

  private async save() {
    await this.storage.store(Vault.storageKey, JSON.stringify(this.secrets));
  }

  public async store(secret: Secret, value: string): Promise<void> {
    this.secrets[secret.collection] = {
      ...this.secrets[secret.collection],
      [secret.key]: value,
    };
    this.save();
  }

  public get(secret: Secret): string | undefined {
    return this.secrets[secret.collection]?.[secret.key];
  }

  public async delete(secret: Secret): Promise<void> {
    delete this.secrets[secret.collection][secret.key];
    this.save();
  }

  public listCollections(): Collection[] {
    return Object.entries(this.secrets).map(([collection, secrets]) => ({
      name: collection,
      enabled: this.enabledCollections.includes(collection),
      secrets: Object.entries(secrets).map(([key]) => ({
        key,
        collection,
      })),
    }));
  }

  async validateEnvName(input: string) {
    return input.match(/^[a-zA-Z_]+[a-zA-Z0-9_]*$/) ? true : false;
  }

  async import(uri: Uri) {
    const document = await workspace.openTextDocument(uri);
    const content = document.getText();
    this.secrets = JSON.parse(content);
    this.save();
  }

  async export(uri: Uri) {
    const vault = await this.storage.get("secrets");
    const buffer = Buffer.from(vault || "{}", "utf-8");
    await workspace.fs.writeFile(uri, buffer);
  }

  public async addCollection(name: string) {
    if (this.secrets[name]) {
      throw new Error(`Collection ${name} already exists`);
    }
    this.secrets[name] = {};
    await workspace
      .getConfiguration(Vault.storageKey)
      .update(
        "enabledCollections",
        [...this.enabledCollections, name],
        this.getConfigurationTarget()
      );
    await this.save();
  }

  public async deleteCollection(collection: Collection) {
    if (!this.secrets[collection.name]) {
      throw new Error(`Collection ${collection.name} does not exist`);
    }
    delete this.secrets[collection.name];

    const conf = workspace.getConfiguration(Vault.storageKey);
    if (this.getConfigurationTarget() === ConfigurationTarget.Workspace) {
      conf.update(
        "enabledCollections",
        this.enabledCollections.filter((c) => c !== collection.name),
        ConfigurationTarget.Workspace
      );
    }
    conf.update(
      "enabledCollections",
      this.enabledCollections.filter((c) => c !== collection.name),
      ConfigurationTarget.Global
    );
    await this.save();
  }

  toggleCollection(collection: Collection) {
    const conf = workspace.getConfiguration(Vault.storageKey);

    if (collection.enabled) {
      conf.update(
        "enabledCollections",
        this.enabledCollections.filter((c) => c !== collection.name),
        this.getConfigurationTarget()
      );
    } else {
      conf.update(
        "enabledCollections",
        [...this.enabledCollections, collection.name],
        this.getConfigurationTarget()
      );
    }
  }

  private getConfigurationTarget() {
    return workspace.workspaceFolders
      ? ConfigurationTarget.Workspace
      : ConfigurationTarget.Global;
  }
}
