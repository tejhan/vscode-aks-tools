import { DefinedResourceGroup } from "../../commands/utils/resourceGroups";
import { WebviewDefinition } from "../webviewTypes";
import { Subscription } from "./draft/types";
import { TreeNode } from "../../commands/utils/octokitHelper";

// Define the initial state passed to the webview
export interface InitialState {
    repos: string[];
}

export type InitialSelection = {
    subscriptionId?: string;
};

export interface ResourceGroup {
    name: string;
    location: string;
}

export type AcrKey = {
    acrName: string;
};

export interface BranchParams {
    repoOwner: string;
    repo: string;
}

export interface RepoKey extends BranchParams {
    branchName: string;
}

export type ClusterKey = {
    subscriptionId: string;
    resourceGroup: string;
    clusterName: string;
};

// Define messages sent from the webview to the VS Code extension
export type ToVsCodeMsgDef = {
    getGitHubReposRequest: void;
    getGitHubBranchesRequest: BranchParams;
    getSubscriptionsRequest: void;
    createWorkflowRequest: void;
    getResourceGroupsRequest: void;
    getAcrsRequest: { subscriptionId: string; acrResourceGroup: string };
    getNamespacesRequest: ClusterKey;
    getRepoTreeStructureRequest: RepoKey;
};

// Define messages sent from the VS Code extension to the webview
export type ToWebViewMsgDef = {
    getGitHubReposResponse: { repos: string[] };
    getGitHubBranchesResponse: { branches: string[] };
    getSubscriptionsResponse: Subscription[];
    getNamespacesResponse: string[];
    getResourceGroupsResponse: DefinedResourceGroup[];
    getAcrsResponse: { acrs: AcrKey[] };
    getWorkflowCreationResponse: string;
    getRepoTreeStructureResponse: TreeNode;
};

// Combine the definitions into a single WebviewDefinition
export type AutomatedDeploymentsDefinition = WebviewDefinition<InitialState, ToVsCodeMsgDef, ToWebViewMsgDef>;
