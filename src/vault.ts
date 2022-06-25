import {
  workspace,
  Uri,
  SecretStorage,
  EventEmitter,
  EnvironmentVariableCollection,
  ConfigurationTarget,
} from "vscode";
import { Group, Secret } from "./tree";

export interface Secrets {
  [group: string]: {
    [key: string]: string;
  };
}
export class Vault {
  private readonly storage: SecretStorage;
  private readonly windowEnv: EnvironmentVariableCollection;
  private static readonly storageKey = "secrets";

  private secrets: Secrets = {};
  private enabledGroups: string[] = [];

  private _onChange: EventEmitter<void> = new EventEmitter();
  readonly onChange = this._onChange.event;

  public getActiveSecrets(): Record<string, Secret> {
    const activeSecrets: Record<string, Secret> = {};
    for (const context of this.enabledGroups) {
      for (const key of Object.keys(this.secrets[context] || {})) {
        activeSecrets[key] = { key, group: context };
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
    await vault.loadEnabledGroups();
    await vault.refresh();

    storage.onDidChange(async (e) => {
      if (e.key === Vault.storageKey) {
        vault.load();
        vault.refresh();
      }
    });

    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${this.storageKey}.enabledGroups`)) {
        vault.loadEnabledGroups();
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

  public async loadEnabledGroups() {
    this.enabledGroups = workspace
      .getConfiguration(Vault.storageKey)
      .get("enabledGroups", ["default"]);
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

    // Clean up secrets that are not in the active groups
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
    this.secrets[secret.group] = {
      ...this.secrets[secret.group],
      [secret.key]: value,
    };
    this.save();
  }

  public get(secret: Secret): string | undefined {
    return this.secrets[secret.group]?.[secret.key];
  }

  public async delete(secret: Secret): Promise<void> {
    delete this.secrets[secret.group][secret.key];
    this.save();
  }

  public listGroups(): Group[] {
    return Object.entries(this.secrets).map(([group, secrets]) => ({
      name: group,
      enabled: this.enabledGroups.includes(group),
      secrets: Object.entries(secrets).map(([key]) => ({
        key,
        group,
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

  public async addGroup(name: string) {
    if (this.secrets[name]) {
      throw new Error(`Group ${name} already exists`);
    }
    this.secrets[name] = {};
    await workspace
      .getConfiguration(Vault.storageKey)
      .update(
        "enabledGroups",
        [...this.enabledGroups, name],
        this.getConfigurationTarget()
      );
    await this.save();
  }

  public async deleteGroup(group: Group) {
    if (!this.secrets[group.name]) {
      throw new Error(`Group ${group.name} does not exist`);
    }
    delete this.secrets[group.name];

    const conf = workspace.getConfiguration(Vault.storageKey);
    if (this.getConfigurationTarget() === ConfigurationTarget.Workspace) {
      conf.update(
        "enabledGroups",
        this.enabledGroups.filter((c) => c !== group.name),
        ConfigurationTarget.Workspace
      );
    }
    conf.update(
      "enabledGroups",
      this.enabledGroups.filter((c) => c !== group.name),
      ConfigurationTarget.Global
    );
    await this.save();
  }

  toggleGroup(group: Group) {
    const conf = workspace.getConfiguration(Vault.storageKey);

    if (group.enabled) {
      conf.update(
        "enabledGroups",
        this.enabledGroups.filter((c) => c !== group.name),
        this.getConfigurationTarget()
      );
    } else {
      conf.update(
        "enabledGroups",
        [...this.enabledGroups, group.name],
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
