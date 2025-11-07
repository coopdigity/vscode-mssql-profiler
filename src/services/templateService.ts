import * as vscode from 'vscode';
import * as path from 'path';
import { ProfilerSessionTemplate } from '../models/profilerTypes';

/**
 * Service for managing profiler session templates
 */
export class TemplateService {
    private templates: ProfilerSessionTemplate[] = [];

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Load all session templates from the templates directory
     */
    public async loadTemplates(): Promise<void> {
        try {
            // Load built-in templates
            const templateNames = ['Standard', 'TSQL', 'Standard_Azure'];

            for (const name of templateNames) {
                const templatePath = path.join(
                    this.context.extensionPath,
                    'templates',
                    `${name}.json`
                );

                try {
                    const uri = vscode.Uri.file(templatePath);
                    const content = await vscode.workspace.fs.readFile(uri);
                    const template = JSON.parse(content.toString()) as ProfilerSessionTemplate;
                    this.templates.push(template);
                } catch (error) {
                    console.error(`Failed to load template ${name}:`, error);
                }
            }

            console.log(`Loaded ${this.templates.length} profiler templates`);
        } catch (error) {
            console.error('Failed to load profiler templates:', error);
            vscode.window.showErrorMessage('Failed to load profiler templates');
        }
    }

    /**
     * Get all available templates
     */
    public getTemplates(): ProfilerSessionTemplate[] {
        return this.templates;
    }

    /**
     * Get a template by name
     */
    public getTemplateByName(name: string): ProfilerSessionTemplate | undefined {
        return this.templates.find(t => t.name === name);
    }

    /**
     * Get template names for UI display
     */
    public getTemplateNames(): string[] {
        return this.templates.map(t => t.name);
    }

    /**
     * Replace {sessionName} placeholder in the create statement
     */
    public substituteSessionName(template: ProfilerSessionTemplate, sessionName: string): string {
        return template.createStatement.replace(/\{sessionName\}/g, sessionName);
    }
}
