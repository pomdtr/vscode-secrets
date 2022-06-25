# Visual Studio Code Secret

Define secrets shared accross workspace, injected as environment variables.

## Usage

Use the secrets tree view to manage your secrets.

## Folders

If you want associate multiple values to the same environment variable (ex: `GITHUB_TOKEN`), you can use set it in two different folders.

Use to the `secrets.enabledFolders` pref to specify which folder to use in you current workspace.

```javascript
{
    // Both the default and github folders will be loaded in this workspace
    "secrets.enabledFolders": [
        "default",
        "github"
    ]
}
```
