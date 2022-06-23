import {
  ExtensionContext,
  commands,
  window,
  workspace,
  Uri,
  env,
} from "vscode";
import { Collection, Secret } from "./tree";
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

  async editSecret(secret: Secret) {
    const old = await this.vault.get(secret);
    const value = await window.showInputBox({
      value: old,
      title: "Secret Value",
      validateInput: (input) => (!input ? "Value is required" : undefined),
    });
    if (!value) {
      return;
    }

    await this.vault.store(secret, value);
    await window.showInformationMessage(`Updated secret ${secret.key}`);
  }

  async deleteSecret(secret: Secret) {
    await this.vault.delete(secret);
  }

  async refresh() {
    await this.vault.refresh();
    await window.showInformationMessage(`Secrets refreshed.`);
  }

  async create(environment: string) {
    const key = await window.showInputBox({
      title: "Secret Name",
      validateInput: (input) => {
        if (!input.match(/^[a-zA-Z_]+[a-zA-Z0-9_]*$/)) {
          return "Invalid key";
        }
      },
      placeHolder: "e.g. SECRET_NAME",
    });
    if (!key) {
      return;
    }
    const value = await window.showInputBox({
      title: "Secret Value",
      validateInput: (input) => (!input ? "Value is required" : undefined),
      placeHolder: "e.g. PASSWORD",
    });
    if (!value) {
      return;
    }

    await this.vault.store({ collection: environment, key }, value);
  }

  async addCollection() {
    const collections = this.vault.listCollections().map((c) => c.name);
    const name = await window.showInputBox({
      title: "Collection Name",
      validateInput: (input) =>
        collections.includes(input) ? "Collection already exists" : null,
    });
    if (!name) {
      return;
    }
    this.vault.addCollection(name);
  }

  async deleteCollection(collection: Collection) {
    await this.vault.deleteCollection(collection);
  }

  async copySecret(secret: Secret) {
    const value = await this.vault.get(secret);
    if (typeof value !== "undefined") {
      env.clipboard.writeText(value);
      window.showInformationMessage(`Copied to clipboard`);
    }
  }

  async toggleCollection(collection: Collection) {
    this.vault.toggleCollection(collection);
  }

  static register(context: ExtensionContext, vault: Vault) {
    const controller = new SecretController(vault);

    context.subscriptions.push(
      commands.registerCommand("secrets.import", () => controller.import()),
      commands.registerCommand("secrets.export", () => controller.export()),
      commands.registerCommand("secrets.create", (environment: Collection) =>
        controller.create(environment.name)
      ),
      commands.registerCommand("secrets.delete", (secret: Secret) =>
        controller.deleteSecret(secret)
      ),
      commands.registerCommand("secrets.edit", (secret: Secret) =>
        controller.editSecret(secret)
      ),
      commands.registerCommand("secrets.copy", (secret: Secret) =>
        controller.copySecret(secret)
      ),
      commands.registerCommand("collections.create", () =>
        controller.addCollection()
      ),
      commands.registerCommand(
        "collections.delete",
        (collection: Collection) => controller.deleteCollection(collection)
      ),
      commands.registerCommand("collections.enable", (collection: Collection) => controller.toggleCollection(collection)),
      commands.registerCommand("collections.disable", (collection: Collection) => controller.toggleCollection(collection)),
      commands.registerCommand("secrets.refresh", () => controller.refresh()),
    );
  }
}
