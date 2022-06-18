import {
  workspace,
  Uri,
  SecretStorage,
  EventEmitter,
  EnvironmentVariableCollection,
  ConfigurationTarget,
} from "vscode";

export class Vault {
  private readonly storage: SecretStorage;
  private readonly env: EnvironmentVariableCollection;
  private state: Record<string, string> = {};
  private allowlist: string[] = Vault.getConfig().get("allowlist", []);

  private _onChange: EventEmitter<void> = new EventEmitter();
  readonly onChange = this._onChange.event;

  static async create(
    storage: SecretStorage,
    env: EnvironmentVariableCollection
  ): Promise<Vault> {
    const vault = new Vault(storage, env);
    await vault.refresh();

    return vault;
  }

  static getConfig() {
    return workspace.getConfiguration("secretManager");
  }

  isEnabled(key: string): boolean {
    return this.allowlist.includes(key);
  }

  constructor(storage: SecretStorage, env: EnvironmentVariableCollection) {
    this.storage = storage;
    this.env = env;

    this.storage.onDidChange(async (e) => {
      if (e.key === "vault") {
        this.refresh();
      }
    });

    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("secretManager.allowlist")) {
        this.allowlist = Vault.getConfig().get("allowlist", []);
        this.refresh();
      }
    });
  }

  async disable(key: string) {
    this.allowlist = this.allowlist.filter((k) => k !== key);
    await Vault.getConfig().update(
      "allowlist",
      this.allowlist,
      workspace.workspaceFolders
        ? ConfigurationTarget.Workspace
        : ConfigurationTarget.Global
    );
  }

  async enable(key: string) {
    this.allowlist = [...this.allowlist, key];
    await Vault.getConfig().update(
      "allowlist",
      this.allowlist,
      workspace.workspaceFolders
        ? ConfigurationTarget.Workspace
        : ConfigurationTarget.Global
    );
  }

  async refresh() {
    const content = await this.storage.get("vault");

    this.state = content ? JSON.parse(content) : {};

    this.env.forEach((key) => {
      if (!this.state[key] || !this.isEnabled(key)) {
        this.env.delete(key);
      }
    });

    for (const key in this.state) {
      if (this.isEnabled(key)) {
        this.env.replace(key, this.state[key]);
      }
    }

    this._onChange.fire();
  }

  async store(key: string, value: string): Promise<void> {
    await this.enable(key);
    await this.storage.store(
      "vault",
      JSON.stringify({ ...this.state, [key]: value })
    );
  }

  list(enabled?: boolean): string[] {
    if (typeof enabled === "undefined" || enabled) {
      return Object.keys(this.state).filter((k) => this.isEnabled(k));
    } else {
      return Object.keys(this.state).filter((k) => !this.isEnabled(k));
    }
  }

  get(key: string): string | undefined {
    return this.state[key];
  }

  async delete(key: string): Promise<void> {
    await this.storage.store(
      "vault",
      JSON.stringify({ ...this.state, [key]: undefined })
    );
  }

  async import(uri: Uri) {
    const document = await workspace.openTextDocument(uri);
    const content = document.getText();
    this.storage.store("vault", content);
  }

  async export(uri: Uri) {
    const vault = await this.storage.get("vault");
    const buffer = Buffer.from(vault || "{}", "utf-8");
    await workspace.fs.writeFile(uri, buffer);
  }
}
