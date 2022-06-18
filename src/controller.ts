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
      defaultUri = Uri.joinPath(
        workspace.workspaceFolders[0].uri,
        "vault.json"
      );
    }

    const uri = await window.showOpenDialog({
      defaultUri,
      canSelectMany: false,
      filters: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Vault secrets": ["json"],
      },
      openLabel: "Import",
    });
    if (!uri || uri.length === 0) {
      return;
    }
    await this.vault.import(uri[0]);
    window.showInformationMessage(`Imported secrets`);
  }

  async export() {
    let defaultUri: Uri | undefined;
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
      defaultUri = Uri.joinPath(
        workspace.workspaceFolders[0].uri,
        "vault.json"
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
      commands.registerCommand("vault.import", () => manager.import()),
      commands.registerCommand("vault.export", () => manager.export()),
      commands.registerCommand("vault.create", () => manager.create()),
      commands.registerCommand("vault.delete", (key) =>
        manager.deleteSecret(key)
      ),
      commands.registerCommand("vault.edit", (key) => manager.editSecret(key)),
      commands.registerCommand("vault.copy", (key) => manager.copySecret(key)),
      commands.registerCommand("vault.disable", (key) => manager.disable(key)),
      commands.registerCommand("vault.enable", (key) => manager.enable(key))
    );
  }
}
