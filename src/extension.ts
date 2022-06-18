// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SecretController } from "./controller";
import { VaultTreeDataProvider } from "./tree";
import { Vault } from "./vault";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const vault = await Vault.create(context.secrets, context.environmentVariableCollection);

  SecretController.register(context, vault);
  VaultTreeDataProvider.register(context, vault);
}


// this method is called when your extension is deactivated
export function deactivate() {}
