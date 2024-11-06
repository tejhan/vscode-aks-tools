import { BasePanel, PanelDataProvider } from "./BasePanel";
import * as vscode from "vscode";
import * as k8s from "vscode-kubernetes-tools-api";
import { MessageHandler, MessageSink } from "../webview-contract/messaging";
import { ToVsCodeMsgDef, ToWebViewMsgDef, ModelState } from "../webview-contract/webviewDefinitions/kaitoManage";
import { InitialState } from "../webview-contract/webviewDefinitions/kaitoManage";
import { TelemetryDefinition } from "../webview-contract/webviewTypes";
import { invokeKubectlCommand } from "../commands/utils/kubectl";
import { failed } from "../commands/utils/errorable";
import { longRunning } from "../commands/utils/host";
import { getConditions, convertAgeToMinutes } from "./utilities/KaitoHelpers";
import { join } from "path";
import { writeFileSync } from "fs";
import { tmpdir } from "os";

export class KaitoManagePanel extends BasePanel<"kaitoManage"> {
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, "kaitoManage", {
            monitorUpdate: null,
        });
    }
}

export class KaitoManagePanelDataProvider implements PanelDataProvider<"kaitoManage"> {
    public constructor(
        readonly clusterName: string,
        readonly subscriptionId: string,
        readonly resourceGroupName: string,
        readonly armId: string,
        readonly kubectl: k8s.APIAvailable<k8s.KubectlV1>,
        readonly kubeConfigFilePath: string,
        readonly models: ModelState[],
    ) {
        this.clusterName = clusterName;
        this.subscriptionId = subscriptionId;
        this.resourceGroupName = resourceGroupName;
        this.armId = armId;
        this.kubectl = kubectl;
        this.kubeConfigFilePath = kubeConfigFilePath;
        this.models = models;
    }

    getTitle(): string {
        return `Manage Kaito Models`;
    }
    getInitialState(): InitialState {
        return {
            clusterName: this.clusterName,
            models: this.models,
        };
    }
    getTelemetryDefinition(): TelemetryDefinition<"kaitoManage"> {
        return {
            monitorUpdateRequest: false,
            deleteWorkspaceRequest: false,
            redeployWorkspaceRequest: false,
            getLogsRequest: false,
        };
    }
    getMessageHandler(webview: MessageSink<ToWebViewMsgDef>): MessageHandler<ToVsCodeMsgDef> {
        void webview;
        return {
            monitorUpdateRequest: (params) => {
                this.handleMonitorUpdateRequest(params.models, webview);
            },
            deleteWorkspaceRequest: (params) => {
                this.handleDeleteWorkspaceRequest(params.model, webview);
            },
            redeployWorkspaceRequest: (params) => {
                this.handleRedeployWorkspaceRequest(params.modelName, params.modelYaml, webview);
            },
            getLogsRequest: () => {
                this.handleGetLogsRequest();
            },
        };
    }
    // State tracker for ongoing operations
    private operating: { [modelName: string]: boolean } = {};
    private async handleDeleteWorkspaceRequest(model: string, webview: MessageSink<ToWebViewMsgDef>) {
        if (this.operating[model]) {
            return;
        }

        this.operating[model] = true;
        try {
            await longRunning(`Deleting 'workspace-${model}'`, async () => {
                const command = `delete workspace workspace-${model}`;
                const kubectlresult = await invokeKubectlCommand(this.kubectl, this.kubeConfigFilePath, command);
                if (failed(kubectlresult)) {
                    vscode.window.showErrorMessage(
                        `There was an error deleting 'workspace-${model}'. ${kubectlresult.error}`,
                    );
                    return;
                }
            });
            vscode.window.showInformationMessage(`'workspace-${model}' was deleted successfully`);
            await this.updateModels(webview);
        } finally {
            this.operating[model] = false;
        }
    }

    // Deletes the workspace and redeploys it
    private async handleRedeployWorkspaceRequest(
        modelName: string,
        modelYaml: string,
        webview: MessageSink<ToWebViewMsgDef>,
    ) {
        if (this.operating[modelName]) {
            return;
        }
        try {
            await this.handleDeleteWorkspaceRequest(modelName, webview);
            this.operating[modelName] = true;
            await longRunning(`Re-deploying 'workspace-${modelName}'`, async () => {
                const tempFilePath = join(tmpdir(), `kaito-deployment-${Date.now()}.yaml`);
                writeFileSync(tempFilePath, modelYaml, "utf8");
                const command = `apply -f ${tempFilePath}`;
                const kubectlresult = await invokeKubectlCommand(this.kubectl, this.kubeConfigFilePath, command);
                if (failed(kubectlresult)) {
                    vscode.window.showErrorMessage(`Error deploying 'workspace-${modelName}': ${kubectlresult.error}`);
                    return;
                }
            });
            vscode.window.showInformationMessage(`'workspace-${modelName}' has been redeployed.`);
            await this.updateModels(webview);
        } finally {
            this.operating[modelName] = false;
        }
    }

    // Updates the current state of models on the cluster
    private async updateModels(webview: MessageSink<ToWebViewMsgDef>) {
        const command = `get workspace -o json`;
        const kubectlresult = await invokeKubectlCommand(this.kubectl, this.kubeConfigFilePath, command);
        if (failed(kubectlresult)) {
            webview.postMonitorUpdate({
                clusterName: this.clusterName,
                models: [],
            });
            return;
        }

        const models = [];
        const data = JSON.parse(kubectlresult.result.stdout);
        for (const item of data.items) {
            const conditions: Array<{ type: string; status: string }> = item.status?.conditions || [];
            const { resourceReady, inferenceReady, workspaceReady } = getConditions(conditions);
            models.push({
                name: item.inference.preset.name,
                instance: item.resource.instanceType,
                resourceReady: resourceReady,
                inferenceReady: inferenceReady,
                workspaceReady: workspaceReady,
                age: convertAgeToMinutes(item.metadata?.creationTimestamp),
            });
        }

        webview.postMonitorUpdate({
            clusterName: this.clusterName,
            models: models,
        });
    }

    private async handleMonitorUpdateRequest(models: ModelState[], webview: MessageSink<ToWebViewMsgDef>) {
        void models;
        await this.updateModels(webview);
    }

    // Retrieves the logs from the Kaito workspace and outputs them in a new text editor.
    private async handleGetLogsRequest() {
        await longRunning(`Retrieving logs`, async () => {
            const command = `get pods -l app=ai-toolchain-operator --all-namespaces --no-headers | awk '/kaito-workspace/ {print "kubectl logs -n " $1 " " $2}' | xargs -I {} bash -c '{}'`;
            const kubectlresult = await invokeKubectlCommand(this.kubectl, this.kubeConfigFilePath, command);
            if (failed(kubectlresult)) {
                vscode.window.showErrorMessage(`Error fetching logs: ${kubectlresult.error}`);
                return;
            }
            const logs = kubectlresult.result.stdout;
            const tempFilePath = join(tmpdir(), "kaito-workspace-logs.txt");
            writeFileSync(tempFilePath, logs, "utf8");
            const doc = await vscode.workspace.openTextDocument(tempFilePath);
            vscode.window.showTextDocument(doc);
        });
    }
}