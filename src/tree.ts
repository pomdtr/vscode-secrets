import {
  TreeDataProvider,
  TreeItem,
  ProviderResult,
  Event,
  EventEmitter,
  ExtensionContext,
  window,
  ThemeIcon,
  ThemeColor,
  TreeItemCollapsibleState,
} from "vscode";
import { Vault } from "./vault";

interface Category {
  category: string;
  children: string[];
  collapsibleState: TreeItemCollapsibleState;
}

export class VaultTreeDataProvider
  implements TreeDataProvider<string | Category>
{
  vault: Vault;

  private _onDidChangeTreeData: EventEmitter<
    string | Category | undefined | null | void
  > = new EventEmitter<string | undefined | null | void>();
  readonly onDidChangeTreeData: Event<
    string | Category | undefined | null | void
  > = this._onDidChangeTreeData.event;

  static register(context: ExtensionContext, vault: Vault) {
    const tree = new VaultTreeDataProvider(vault);
    return context.subscriptions.push(
      window.registerTreeDataProvider("vault", tree)
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  constructor(vault: Vault) {
    this.vault = vault;
    vault.onChange(() => this.refresh());
  }

  getTreeItem(item: string | Category): TreeItem {
    if (typeof item === "string") {
      const isEnabled = this.vault.isEnabled(item);
      return {
        label: item,
        iconPath: new ThemeIcon(
          "lock",
          isEnabled
            ? new ThemeColor("iconForeground")
            : new ThemeColor("disabledForeground")
        ),
        contextValue: isEnabled ? "enabledItem" : "disabledItem",
        tooltip: this.vault.get(item),
      };
    } else {
      return {
        label: item.category,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        contextValue: "category",
      };
    }
  }

  getChildren(item?: Category): ProviderResult<(string | Category)[]> {
    if (item) {
      return item.children;
    }
    return [
      ...this.vault.list(true),
      {
        category: "Disabled",
        children: this.vault.list(false),
        collapsibleState: TreeItemCollapsibleState.Collapsed,
      },
    ];
  }
}
