import {
  TreeDataProvider,
  TreeItem,
  ProviderResult,
  Event,
  EventEmitter,
  ExtensionContext,
  window,
  ThemeIcon,
  TreeItemCollapsibleState,
} from "vscode";
import { Vault } from "./vault";

export interface Collection {
  name: string;
  enabled: boolean;
  secrets: Secret[];
}

export interface Secret {
  key: string;
  collection: string;
}

export interface Category {
  name: string;
  expanded: boolean;
  children: Secret[] | Collection[];
}

type Node = Secret | Category | Collection;

export class VaultTreeDataProvider implements TreeDataProvider<Node> {
  vault: Vault;

  private _onDidChangeTreeData: EventEmitter<Node | undefined | null | void> =
    new EventEmitter();
  readonly onDidChangeTreeData: Event<Node | undefined | null | void> =
    this._onDidChangeTreeData.event;

  static register(context: ExtensionContext, vault: Vault) {
    const tree = new VaultTreeDataProvider(vault);
    return context.subscriptions.push(
      window.registerTreeDataProvider("secretExplorer", tree)
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  constructor(vault: Vault) {
    this.vault = vault;
    vault.onChange(() => this.refresh());
  }

  isCategory(item: Node): item is Category {
    return item.hasOwnProperty("children");
  }

  isCollection(item: Node): item is Collection {
    return item.hasOwnProperty("secrets");
  }

  getTreeItem(item: Node): TreeItem {
    if (this.isCategory(item)) {
      return {
        label: item.name,
        collapsibleState: item.expanded
          ? TreeItemCollapsibleState.Expanded
          : TreeItemCollapsibleState.Collapsed,
        contextValue: `category-${item.name.toLowerCase()}`,
      };
    } else if (this.isCollection(item)) {
      return {
        label: item.name,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        description: item.enabled ? "Enabled" : "Disabled",
        contextValue: item.enabled ? "enabled-collection" : "disabled-collection",
      };
    } else {
      return {
        label: item.key,
        iconPath: new ThemeIcon("lock"),
        tooltip: this.vault.get(item),
        description: item.collection,
        contextValue: "secret",
      };
    }
  }

  getChildren(item?: Category | Collection): ProviderResult<Node[]> {
    if (item) {
      return this.isCategory(item) ? item.children : item.secrets;
    }
    return [
      {
        name: "Active Secrets",
        children: Object.values(this.vault.getActiveSecrets()),
        expanded: true,
      },
      {
        name: "Collections",
        children: this.vault.listCollections(),
        expanded: false,
      },
    ];
  }
}
