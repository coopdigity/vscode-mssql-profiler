import * as vscode from 'vscode';
import { ProfilerController } from './controllers/profilerController';

let controller: ProfilerController | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('SQL Server Profiler extension is now active');

    // Initialize the profiler controller
    controller = new ProfilerController(context);
    controller.activate();

    // Log successful activation
    vscode.window.showInformationMessage('SQL Server Profiler extension activated!');
}

export function deactivate() {
    if (controller) {
        controller.deactivate();
        controller = undefined;
    }
}
