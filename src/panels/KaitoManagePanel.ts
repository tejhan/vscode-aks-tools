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
    ) {
        this.clusterName = clusterName;
        this.subscriptionId = subscriptionId;
        this.resourceGroupName = resourceGroupName;
        this.armId = armId;
        this.kubectl = kubectl;
        this.kubeConfigFilePath = kubeConfigFilePath;
    }
    private checkingWorkspaces: boolean = false;

    getTitle(): string {
        return `Manage Kaito Models`;
    }
    getInitialState(): InitialState {
        return {
            clusterName: this.clusterName,
            models: [
                {
                    name: "example-model-1",
                    instance: "Standard_NC12s_v3",
                    resourceReady: null,
                    inferenceReady: null,
                    workspaceReady: null,
                    age: 10,
                },
                {
                    name: "example-model-2",
                    instance: "Standard_NC12s_v3",
                    resourceReady: true,
                    inferenceReady: true,
                    workspaceReady: true,
                    age: 30,
                },
                {
                    name: "example-model-3",
                    instance: "Standard_NC12s_v3",
                    resourceReady: false,
                    inferenceReady: false,
                    workspaceReady: false,
                    age: 300,
                },
            ],
        };
    }
    getTelemetryDefinition(): TelemetryDefinition<"kaitoManage"> {
        return {
            monitorUpdateRequest: false,
            deleteWorkspaceRequest: false,
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
        };
    }
    statusToBoolean(status: string): boolean {
        if (status.toLowerCase() === "true") {
            return true;
        }
        return false;
    }
    convertAgeToMinutes(creationTimestamp: string): number {
        const createdTime = new Date(creationTimestamp);
        const currentTime = new Date();
        const differenceInMilliseconds = currentTime.getTime() - createdTime.getTime();
        const differenceInMinutes = Math.floor(differenceInMilliseconds / 1000 / 60);
        return differenceInMinutes;
    }
    private async handleDeleteWorkspaceRequest(model: string, webview: MessageSink<ToWebViewMsgDef>) {
        await longRunning(`Deleting workspace workspace-${model}`, async () => {
            const command = `delete workspace workspace-${model}`;
            const kubectlresult = await invokeKubectlCommand(this.kubectl, this.kubeConfigFilePath, command);
            if (failed(kubectlresult)) {
                vscode.window.showErrorMessage(`There was an error deleting the workspace. ${kubectlresult.error}`);
                return;
            }
        });
        vscode.window.showInformationMessage(`Workspace workspace-${model} deleted successfully`);
        await this.updateModels(webview);
        // this.checkingWorkspaces = false;
    }

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
            let resourceReady = null;
            let inferenceReady = null;
            let workspaceReady = null;
            conditions.forEach(({ type, status }) => {
                switch (type.toLowerCase()) {
                    case "resourceready":
                        resourceReady = this.statusToBoolean(status);
                        break;
                    case "workspaceready":
                        workspaceReady = this.statusToBoolean(status);
                        break;
                    case "inferenceready":
                        inferenceReady = this.statusToBoolean(status);
                        break;
                }
            });
            models.push({
                name: item.inference.preset.name,
                instance: item.resource.instanceType,
                resourceReady: resourceReady,
                inferenceReady: inferenceReady,
                workspaceReady: workspaceReady,
                age: this.convertAgeToMinutes(item.metadata?.creationTimestamp),
            });
        }
        webview.postMonitorUpdate({
            clusterName: this.clusterName,
            models: models,
        });
    }

    // private canceled: boolean = false;
    private async handleMonitorUpdateRequest(models: ModelState[], webview: MessageSink<ToWebViewMsgDef>) {
        void models;
        this.checkingWorkspaces = true;
        while (this.checkingWorkspaces) {
            await this.updateModels(webview);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}
