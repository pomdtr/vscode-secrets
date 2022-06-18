import {
  ExtensionContext,
  commands,
  window,
  workspace,
  Uri,
  env,
} from "vscode";
import { Vault } from "./vault";

export class SecretController {
  readonly vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  async import() {
    let defaultUri: Uri | undefined;
    if (
      window.activeTextEditor &&
      window.activeTextEditor.document.languageId === "json"
    ) {
      defaultUri = window.activeTextEditor.document.uri;
    } else if (
      workspace.workspaceFolders &&
      workspace.workspaceFolders.length > 0
    ) {
      defaultUri = workspace.workspaceFolders[0].uri;
    }

    const uri = await window.showOpenDialog({
      defaultUri,
      canSelectMany: false,
      filters: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Secrets: ["json"],
      },
      openLabel: "Import",
    });
    if (!uri || uri.length === 0) {
      return;
    }
    try {
      await this.vault.import(uri[0]);
      window.showInformationMessage(`Imported secrets`);
    } catch (e) {
      window.showErrorMessage(
        "Failed to import secrets. Please check the file format."
      );
    }
  }

  async export() {
    let defaultUri: Uri | undefined;
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
      defaultUri = Uri.joinPath(
        workspace.workspaceFolders[0].uri,
        "secrets.json"
      );
    }

    const saveUri = await window.showSaveDialog({
      defaultUri,
      filters: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Vault secrets": ["json"],
      },
    });

    if (!saveUri) {
      return;
    }

    this.vault.export(saveUri);
  }

  async editSecret(key: string) {
    const old = await this.vault.get(key);
    const secret = await window.showInputBox({
      value: old,
      title: "Environment variable value",
      validateInput: (input) => (!input ? "Value is required" : undefined),
    });
    if (!secret) {
      return;
    }

    await this.vault.store(key, secret);
    await window.showInformationMessage(`Updated secret ${key}`);
  }

  async deleteSecret(key: string) {
    await this.vault.delete(key);
    this.disable(key);
  }

  async disable(key: string) {
    this.vault.disable(key);
  }

  async enable(key: string) {
    this.vault.enable(key);
  }

  async create() {
    const key = await window.showInputBox({
      title: "Environment variable name",
      validateInput: (input) => {
        if (!input.match(/^[a-zA-Z_]+[a-zA-Z0-9_]*$/)) {
          return "Invalid key";
        }
      },
      placeHolder: "e.g. MY_VAR",
    });
    if (!key) {
      return;
    }
    const value = await window.showInputBox({
      title: "Environment variable value",
      validateInput: (input) => (!input ? "Value is required" : undefined),
    });
    if (!value) {
      return;
    }

    await this.vault.store(key, value);
  }

  async copySecret(key: string) {
    const secret = await this.vault.get(key);
    if (typeof secret !== "undefined") {
      env.clipboard.writeText(secret);
      window.showInformationMessage(`Copied to clipboard`);
    }
  }

  static register(context: ExtensionContext, vault: Vault) {
    const manager = new SecretController(vault);

    context.subscriptions.push(
      commands.registerCommand("secrets.import", () => manager.import()),
      commands.registerCommand("secrets.export", () => manager.export()),
      commands.registerCommand("secrets.create", () => manager.create()),
      commands.registerCommand("secrets.delete", (key) =>
        manager.deleteSecret(key)
      ),
      commands.registerCommand("secrets.edit", (key) =>
        manager.editSecret(key)
      ),
      commands.registerCommand("secrets.copy", (key) =>
        manager.copySecret(key)
      ),
      commands.registerCommand("secrets.disable", (key) =>
        manager.disable(key)
      ),
      commands.registerCommand("secrets.enable", (key) =>
        manager.enable(key)
      )
    );
  }
}
