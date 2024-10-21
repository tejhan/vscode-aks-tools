import { BasePanel, PanelDataProvider } from "./BasePanel";
import * as vscode from "vscode";
import * as k8s from "vscode-kubernetes-tools-api";
import { MessageHandler, MessageSink } from "../webview-contract/messaging";
import { ToVsCodeMsgDef, ToWebViewMsgDef, ModelState } from "../webview-contract/webviewDefinitions/kaitoManage";
import { InitialState } from "../webview-contract/webviewDefinitions/kaitoManage";
import { TelemetryDefinition } from "../webview-contract/webviewTypes";
import { invokeKubectlCommand } from "../commands/utils/kubectl";
import { failed } from "../commands/utils/errorable";

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
                    age: 0,
                },
                {
                    name: "example-model-2",
                    instance: "Standard_NC12s_v3",
                    resourceReady: true,
                    inferenceReady: true,
                    workspaceReady: true,
                    age: 0,
                },
                {
                    name: "example-model-3",
                    instance: "Standard_NC12s_v3",
                    resourceReady: false,
                    inferenceReady: false,
                    workspaceReady: false,
                    age: 0,
                },
            ],
        };
    }
    getTelemetryDefinition(): TelemetryDefinition<"kaitoManage"> {
        return {
            monitorUpdateRequest: false,
        };
    }
    getMessageHandler(webview: MessageSink<ToWebViewMsgDef>): MessageHandler<ToVsCodeMsgDef> {
        void webview;
        return {
            monitorUpdateRequest: (params) => {
                this.handleMonitorUpdateRequest(params.models, webview);
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
    // private canceled: boolean = false;
    private async handleMonitorUpdateRequest(models: ModelState[], webview: MessageSink<ToWebViewMsgDef>) {
        void models;
        while (true) {
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
        // while (true) {
        //     for (const model of models) {
        //         model.name = new Date().toLocaleTimeString();
        //     }
        //     webview.postMonitorUpdate({
        //         clusterName: this.clusterName,
        //         models,
        //     });
        //     await new Promise((resolve) => setTimeout(resolve, 5000));
        // }

        // const command = `get workspace workspace-${model} -o json`;
        // let kubectlresult = await invokeKubectlCommand(this.kubectl, this.kubeConfigFilePath, command);
        // if (failed(kubectlresult)) {
        //     kubectlresult = await invokeKubectlCommand(this.kubectl, this.kubeConfigFilePath, command);
        //     if (failed(kubectlresult)) {
        //         vscode.window.showErrorMessage(
        //             `There was an error connecting to the workspace. ${kubectlresult.error}`,
        //         );
        //         webview.postDeploymentProgressUpdate({
        //             clusterName: this.clusterName,
        //             modelName: "",
        //             workspaceExists: false,
        //             resourceReady: null,
        //             inferenceReady: null,
        //             workspaceReady: null,
        //             age: 0,
        //         });
        //         this.cancelToken = true;
        //         return;
        //     }
        // }
        // const data = JSON.parse(kubectlresult.result.stdout);
        // const conditions: Array<{ type: string; status: string }> = data.status?.conditions || [];
        // let resourceReady = null;
        // let inferenceReady = null;
        // let workspaceReady = null;

        // conditions.forEach((condition) => {
        //     if (condition.type === "ResourceReady") {
        //         resourceReady = this.statusToBoolean(condition.status);
        //     } else if (condition.type === "WorkspaceReady") {
        //         workspaceReady = this.statusToBoolean(condition.status);
        //     } else if (condition.type === "InferenceReady") {
        //         inferenceReady = this.statusToBoolean(condition.status);
        //     }
        // });

        // webview.postDeploymentProgressUpdate({
        //     clusterName: this.clusterName,
        //     modelName: model,
        //     workspaceExists: true,
        //     resourceReady: resourceReady,
        //     inferenceReady: inferenceReady,
        //     workspaceReady: workspaceReady,
        //     age: this.convertAgeToMinutes(data.metadata?.creationTimestamp),
        // });
        // return;
    }
}
