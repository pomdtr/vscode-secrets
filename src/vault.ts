import {
  workspace,
  Uri,
  SecretStorage,
  EventEmitter,
  EnvironmentVariableCollection,
  ConfigurationTarget,
} from "vscode";
import { Folder, Secret } from "./tree";

export interface Secrets {
  [folder: string]: {
    [key: string]: string;
  };
}
export class Vault {
  private readonly storage: SecretStorage;
  private readonly windowEnv: EnvironmentVariableCollection;
  private static readonly storageKey = "secrets";

  private secrets: Secrets = {};
  private enabledFolders: string[] = [];

  private _onChange: EventEmitter<void> = new EventEmitter();
  readonly onChange = this._onChange.event;

  public getActiveSecrets(): Record<string, Secret> {
    const activeSecrets: Record<string, Secret> = {};
    for (const context of this.enabledFolders) {
      for (const key of Object.keys(this.secrets[context] || {})) {
        activeSecrets[key] = { key, folder: context };
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
    await vault.loadEnabledFolders();
    await vault.refresh();

    storage.onDidChange(async (e) => {
      if (e.key === Vault.storageKey) {
        vault.load();
        vault.refresh();
      }
    });

    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${this.storageKey}.enabledFolders`)) {
        vault.loadEnabledFolders();
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

  public async loadEnabledFolders() {
    this.enabledFolders = workspace
      .getConfiguration(Vault.storageKey)
      .get("enabledFolders", ["default"]);
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

    // Clean up secrets that are not in the active folders
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
    this.secrets[secret.folder] = {
      ...this.secrets[secret.folder],
      [secret.key]: value,
    };
    this.save();
  }

  public get(secret: Secret): string | undefined {
    return this.secrets[secret.folder]?.[secret.key];
  }

  public async delete(secret: Secret): Promise<void> {
    delete this.secrets[secret.folder][secret.key];
    this.save();
  }

  public listFolders(): Folder[] {
    return Object.entries(this.secrets).map(([folder, secrets]) => ({
      name: folder,
      enabled: this.enabledFolders.includes(folder),
      secrets: Object.entries(secrets).map(([key]) => ({
        key,
        folder,
      })),
    }));
  }

  async validateEnvName(input: string) {
    return input.match(/^[a-zA-Z_]+[a-zA-Z0-9_]*$/) ? true : false;
  }

  validateVault(vault: any) {
    if (!(typeof vault === "object")) {
      throw new Error("Vault should be an object");
    }
    for (const [folder, secrets] of Object.entries(vault)) {
      if (!secrets || !(typeof secrets === "object")) {
        throw new Error(`${folder} folder should be an object`);
      }
      for (const [key, value] of Object.entries(secrets)) {
        if (!(typeof value === "string")) {
          throw new Error(`${key} secret value should be a string`)
        }
      }
    }
  }

  async import(uri: Uri) {
    const document = await workspace.openTextDocument(uri);
    const content = document.getText();
    const vault = JSON.parse(content);
    this.validateVault(vault);
    this.secrets = vault;
    this.save();
  }

  async export(uri: Uri) {
    const vault = await this.storage.get("secrets");
    const buffer = Buffer.from(vault || "{}", "utf-8");
    await workspace.fs.writeFile(uri, buffer);
  }

  public async addFolder(name: string) {
    if (this.secrets[name]) {
      throw new Error(`Folder ${name} already exists`);
    }
    this.secrets[name] = {};
    await workspace
      .getConfiguration(Vault.storageKey)
      .update(
        "enabledFolders",
        [...this.enabledFolders, name],
        this.getConfigurationTarget()
      );
    await this.save();
  }

  public async deleteFolder(folder: Folder) {
    if (!this.secrets[folder.name]) {
      throw new Error(`Folder ${folder.name} does not exist`);
    }
    delete this.secrets[folder.name];

    const conf = workspace.getConfiguration(Vault.storageKey);
    if (this.getConfigurationTarget() === ConfigurationTarget.Workspace) {
      conf.update(
        "enabledFolders",
        this.enabledFolders.filter((c) => c !== folder.name),
        ConfigurationTarget.Workspace
      );
    }
    conf.update(
      "enabledFolders",
      this.enabledFolders.filter((c) => c !== folder.name),
      ConfigurationTarget.Global
    );
    await this.save();
  }

  toggleFolder(folder: Folder) {
    const conf = workspace.getConfiguration(Vault.storageKey);

    if (folder.enabled) {
      conf.update(
        "enabledFolders",
        this.enabledFolders.filter((c) => c !== folder.name),
        this.getConfigurationTarget()
      );
    } else {
      conf.update(
        "enabledFolders",
        [...this.enabledFolders, folder.name],
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
