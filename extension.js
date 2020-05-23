const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	let disposable = vscode.commands.registerCommand('byesig.helloWorld', async function () {
		let decorationRenderOption = {
			opacity: "0.2",
			isWholeLine: true,
			backgroundColor: "#eeeeee",
		};

		let decorationType = vscode.window.createTextEditorDecorationType(decorationRenderOption);
		let editor = vscode.window.activeTextEditor;

		let text = editor.document.getText();

		let re_sig_block = new RegExp("^ *sig do$.*?^ *end$", "gsm");
		let re_sig_line = new RegExp("^ *sig {.*?} *?$", "gsm");
		let match = null;
		let ranges = [];
		let folded_selections = [];

		let original_selection = editor.selection;

		while ((match = re_sig_block.exec(text))) {
			let start_pos = editor.document.positionAt(match.index);
			let end_pos = editor.document.positionAt(match.index + match[0].length);
			ranges.push(new vscode.Range(start_pos, end_pos));

			let line_pos = editor.selection.active.with(start_pos.line, 0);
			folded_selections.push(new vscode.Selection(line_pos, line_pos));
		}


		while ((match = re_sig_line.exec(text))) {
			let start_pos = editor.document.positionAt(match.index);
			let end_pos = editor.document.positionAt(match.index + match[0].length);
			ranges.push(new vscode.Range(start_pos, end_pos));
		}

		editor.setDecorations(decorationType, ranges);

		editor.selections = folded_selections;
		await vscode.commands.executeCommand('editor.fold');

		editor.selection = original_selection;
	});

	context.subscriptions.push(disposable);
}
exports.activate = activate;

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
