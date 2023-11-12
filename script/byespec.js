const vscode = require('vscode');
const path = require('path');

const byespec = (function () {
  const COMMAND_FOLD = 'editor.fold';
  const COMMAND_UNFOLD_ALL = 'editor.unfoldAll';
  // @FIXME: Don't match with empty block. Empty block is not foldable by default and as such, folding
  // will affect the parent block - which we do not want.
  const RE_SIG_BLOCK = "^.*?@spec.*?$";
  const RE_SIG_LINE  = "^.*?@spec.*?$";

  const FORCE = true;

  let hideDelayTimeout;
  const DELAY_TIMEOUT_MS = 200;

  let byespecDecorationType = {};
  let temporaryDisable = false;

  let knownDocuments = {};

  function delayedHideSpec() {
    if (hideDelayTimeout) clearTimeout(hideDelayTimeout);
    hideDelayTimeout = setTimeout(hideSpec, DELAY_TIMEOUT_MS);
  }

  async function hideAndFoldSpec(force = false) {
    hideSpec();
    await foldSpec(force);
  }

  function decorationRenderOption() {
    let decoration = {
      opacity: vscode.workspace.getConfiguration('byespec').get('opacity').toString(),
      backgroundColor: vscode.workspace.getConfiguration('byespec').get('backgroundColor'),
    };

    if (vscode.workspace.getConfiguration('byespec').get('showIcon')) {
      decoration['gutterIconPath'] = path.join(__dirname, '..', 'misc', 'icon.png');
      decoration['gutterIconSize'] = "contain";
    }

    return decoration;
  }

  function hideSpec() {
    if (temporaryDisable) return;
    let editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!isElixirFile(editor)) return;

    let tile_key = genTileKey(editor);
    disposeHidingDecoration(tile_key);
    byespecDecorationType[tile_key] = vscode.window.createTextEditorDecorationType(decorationRenderOption());

    if (!vscode.workspace.getConfiguration('byespec').get('enabled')) return;

    editor.setDecorations(byespecDecorationType[tile_key], [
      // ...getMatchPositions(new RegExp(RE_SIG_BLOCK, "gsm"), editor),
      ...getMatchPositions(new RegExp(RE_SIG_LINE, "gsm"), editor)
    ]);
  }

  async function foldSpec(force = false) {
    if (!vscode.workspace.getConfiguration('byespec').get('fold')) return;
    if (!vscode.workspace.getConfiguration('byespec').get('enabled')) return;

    if (temporaryDisable) return;

    let editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (!isElixirFile(editor)) return;
    if (!force && !isNewlyOpened(editor.document.fileName)) return;

    // When switching active editor, it takes time for VSCode to establish a selection.
    // This wait is so the old location of the cursor can be captured correctly.
    setTimeout(async () => {
      let original_selection = editor.selection;
      let folded_selections = getMatchPositions(new RegExp(RE_SIG_BLOCK, "gsm"), editor).map((range) => {
        let line_pos = editor.selection.active.with(range.start.line, 0);
        return new vscode.Selection(line_pos, line_pos);
      });

      if (folded_selections.length > 0) {
        // This is a hack around not having an official API to find foldable regions (other than fold levels or all).
        editor.selections = folded_selections;
        await vscode.commands.executeCommand(COMMAND_UNFOLD_ALL);
        await vscode.commands.executeCommand(COMMAND_FOLD);

        // After selecting the fold regions (and fold) if we restore the cursor immediately sometimes VSCode makes a
        // selection with the delta. To avoid this, we wait a little.
        setTimeout(() => {
          editor.selections = [original_selection];
          editor.revealRange(editor.selections[0]);
        }, 100);
      }
    }, 100);
  }

  /**
   * @param {RegExp} re
   * @param {import("vscode").TextEditor} editor
   */
  function getMatchPositions(re, editor) {
    let match;
    let text = editor.document.getText();
    let ranges = [];

    while ((match = re.exec(text))) {
      let start_pos = editor.document.positionAt(match.index);
      let end_pos = editor.document.positionAt(match.index + match[0].length);
      ranges.push(new vscode.Range(start_pos, end_pos));
    }

    return ranges;
  }

  /**
   * @param {import("vscode").TextEditor} editor
   */
  function isElixirFile(editor) {
    return editor.document.languageId == "elixir";
  }

  async function showAndUnfoldSpec() {
    disposeAllHidingDecoration();
    if (!vscode.workspace.getConfiguration('byespec').get('enabled')) return;
    await vscode.commands.executeCommand(COMMAND_UNFOLD_ALL);
  }

  function disposeAllHidingDecoration() {
    for (let key in byespecDecorationType) {
      disposeHidingDecoration(key);
    }
  }

  /**
   * @param {string} key
   */
  function disposeHidingDecoration(key) {
    if (!byespecDecorationType[key]) return;

    byespecDecorationType[key].dispose();
    delete byespecDecorationType[key];
  }

  function onCommandHideAndFoldSpec() {
    temporaryDisable = false;
    hideAndFoldSpec(FORCE);
  }

  function onCommandShowAndUnfoldSpec() {
    temporaryDisable = true;
    showAndUnfoldSpec();
  }

  /**
   * @param {import("vscode").TextDocument} textDoc
   */
  function onDidOpenTextDocument(textDoc) {
    if (textDoc.languageId != 'elixir') return
    if (knownDocuments[textDoc.fileName]) {
      knownDocuments[textDoc.fileName] += 1;
    } else {
      knownDocuments[textDoc.fileName] = 1;
    }
  }

  /**
   * @param {import("vscode").TextDocument} textDoc
   */
  function onDidCloseTextDocument(textDoc) {
    if (textDoc.languageId != 'elixir') return
    if (!knownDocuments[textDoc.fileName]) return;

    delete knownDocuments[textDoc.fileName];
  }

  /**
   * @param {string} fileName
   */
  function isNewlyOpened(fileName) {
    return knownDocuments[fileName] == 1;
  }

  /**
   * @param {import("vscode").TextEditor} editor
   */
  function genTileKey(editor) {
    return editor.document.fileName;
  }

  /**
   * @param {{ subscriptions: import("vscode").Disposable[]; }} context
   */
  function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('byespec.hideSpec', onCommandHideAndFoldSpec));
    context.subscriptions.push(vscode.commands.registerCommand('byespec.showSpec', onCommandShowAndUnfoldSpec));
    vscode.window.onDidChangeActiveTextEditor(() => { hideAndFoldSpec(); }, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(delayedHideSpec, null, context.subscriptions);
    vscode.workspace.onDidOpenTextDocument(onDidOpenTextDocument, null, context.subscriptions);
    vscode.workspace.onDidCloseTextDocument(onDidCloseTextDocument, null, context.subscriptions);

    if (vscode.window.activeTextEditor) hideAndFoldSpec();
  }

  return { activate: activate };
})();

module.exports = byespec;
