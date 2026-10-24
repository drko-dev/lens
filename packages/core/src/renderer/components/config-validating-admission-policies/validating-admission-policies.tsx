/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./validating-admission-policies.scss";

import React from "react";
import { observer } from "mobx-react";
import { observable, makeObservable } from "mobx";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { KubeObjectAge } from "../kube-object/age";
import { Badge } from "../badge";
import { Tabs, Tab } from "../tabs";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { ValidatingAdmissionPolicyStore } from "./validating-admission-policy-store";
import type { ValidatingAdmissionPolicyBindingStore } from "./validating-admission-policy-binding-store";
import type { MutatingAdmissionPolicyStore } from "./mutating-admission-policy-store";
import type { MutatingAdmissionPolicyBindingStore } from "./mutating-admission-policy-binding-store";

import validatingAdmissionPolicyStoreInjectable from "./validating-admission-policy-store.injectable";
import validatingAdmissionPolicyBindingStoreInjectable from "./validating-admission-policy-binding-store.injectable";
import mutatingAdmissionPolicyStoreInjectable from "./mutating-admission-policy-store.injectable";
import mutatingAdmissionPolicyBindingStoreInjectable from "./mutating-admission-policy-binding-store.injectable";

export enum AdmissionPolicyTab {
  VALIDATING_POLICIES = "validating-policies",
  VALIDATING_BINDINGS = "validating-bindings",
  MUTATING_POLICIES = "mutating-policies",
  MUTATING_BINDINGS = "mutating-bindings",
  POLICIES = "validating-policies",
  BINDINGS = "validating-bindings",
}

enum PolicyColumnId {
  name = "name",
  failurePolicy = "failurePolicy",
  matchResources = "matchResources",
  expressions = "expressions",
  paramKind = "paramKind",
  age = "age",
}

enum BindingColumnId {
  name = "name",
  policyName = "policyName",
  actions = "actions",
  paramRef = "paramRef",
  age = "age",
}

enum MutatingPolicyColumnId {
  name = "name",
  failurePolicy = "failurePolicy",
  matchResources = "matchResources",
  mutations = "mutations",
  paramKind = "paramKind",
  age = "age",
}

enum MutatingBindingColumnId {
  name = "name",
  policyName = "policyName",
  paramRef = "paramRef",
  age = "age",
}

interface Dependencies {
  policyStore: ValidatingAdmissionPolicyStore;
  bindingStore: ValidatingAdmissionPolicyBindingStore;
  mutatingPolicyStore: MutatingAdmissionPolicyStore;
  mutatingBindingStore: MutatingAdmissionPolicyBindingStore;
}

@observer
class NonInjectedValidatingAdmissionPolicies extends React.Component<Dependencies> {
  @observable activeTab: AdmissionPolicyTab = AdmissionPolicyTab.VALIDATING_POLICIES;

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  private onTabChange = (tab: AdmissionPolicyTab) => {
    this.activeTab = tab;
  };

  private renderPolicies() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="config_validating_admission_policies"
        className="ValidatingAdmissionPolicies"
        store={this.props.policyStore}
        sortingCallbacks={{
          [PolicyColumnId.name]: policy => policy.getName(),
          [PolicyColumnId.failurePolicy]: policy => policy.getFailurePolicy(),
          [PolicyColumnId.expressions]: policy => policy.getExpressionsCount(),
          [PolicyColumnId.age]: policy => -policy.getCreationTimestamp(),
        }}
        searchFilters={[
          policy => policy.getSearchFields(),
          policy => policy.getFailurePolicy(),
          policy => policy.getValidations().map(v => v.expression),
        ]}
        renderHeaderTitle="Validating Admission Policies"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: PolicyColumnId.name, id: PolicyColumnId.name },
          { className: "warning", showWithColumn: PolicyColumnId.name },
          { title: "Failure Policy", className: "failurePolicy", sortBy: PolicyColumnId.failurePolicy, id: PolicyColumnId.failurePolicy },
          { title: "Match Resources", className: "matchResources", id: PolicyColumnId.matchResources },
          { title: "Validations (CEL)", className: "expressions", sortBy: PolicyColumnId.expressions, id: PolicyColumnId.expressions },
          { title: "Param Kind", className: "paramKind", id: PolicyColumnId.paramKind },
          { title: "Age", className: "age", sortBy: PolicyColumnId.age, id: PolicyColumnId.age },
        ]}
        renderTableContents={policy => [
          policy.getName(),
          <KubeObjectStatusIcon key="icon" object={policy} />,
          <Badge
            key="failurePolicy"
            label={policy.getFailurePolicy()}
            className={policy.getFailurePolicy() === "Fail" ? "badge-warning" : "badge-secondary"}
          />,
          policy.getMatchResourcesSummary(),
          <span
            key="cel"
            className="cel-code-snippet"
            title={policy.getValidations().map(v => v.expression).join("\n")}>
            {policy.getValidations().length > 0
              ? `${policy.getValidations().length} CEL rule(s): ${policy.getValidations()[0].expression}`
              : "<none>"}
          </span>,
          policy.getParamKind(),
          <KubeObjectAge key="age" object={policy} />,
        ]}
      />
    );
  }

  private renderBindings() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="config_validating_admission_policy_bindings"
        className="ValidatingAdmissionPolicyBindings"
        store={this.props.bindingStore}
        sortingCallbacks={{
          [BindingColumnId.name]: binding => binding.getName(),
          [BindingColumnId.policyName]: binding => binding.getPolicyName(),
          [BindingColumnId.age]: binding => -binding.getCreationTimestamp(),
        }}
        searchFilters={[
          binding => binding.getSearchFields(),
          binding => binding.getPolicyName(),
          binding => binding.getValidationActions(),
        ]}
        renderHeaderTitle="Validating Admission Policy Bindings"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: BindingColumnId.name, id: BindingColumnId.name },
          { className: "warning", showWithColumn: BindingColumnId.name },
          { title: "Policy", className: "policyName", sortBy: BindingColumnId.policyName, id: BindingColumnId.policyName },
          { title: "Actions", className: "actions", id: BindingColumnId.actions },
          { title: "Param Ref", className: "paramRef", id: BindingColumnId.paramRef },
          { title: "Age", className: "age", sortBy: BindingColumnId.age, id: BindingColumnId.age },
        ]}
        renderTableContents={binding => [
          binding.getName(),
          <KubeObjectStatusIcon key="icon" object={binding} />,
          <Badge key="policy" label={binding.getPolicyName()} />,
          binding.getValidationActions().map(action => (
            <Badge
              key={action}
              label={action}
              className={action === "Deny" ? "badge-error" : "badge-warning"} />
          )),
          binding.getParamRefSummary(),
          <KubeObjectAge key="age" object={binding} />,
        ]}
      />
    );
  }

  private renderMutatingPolicies() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="config_mutating_admission_policies"
        className="MutatingAdmissionPolicies"
        store={this.props.mutatingPolicyStore}
        sortingCallbacks={{
          [MutatingPolicyColumnId.name]: policy => policy.getName(),
          [MutatingPolicyColumnId.failurePolicy]: policy => policy.getFailurePolicy(),
          [MutatingPolicyColumnId.mutations]: policy => policy.getMutationsCount(),
          [MutatingPolicyColumnId.age]: policy => -policy.getCreationTimestamp(),
        }}
        searchFilters={[
          policy => policy.getSearchFields(),
          policy => policy.getFailurePolicy(),
        ]}
        renderHeaderTitle="Mutating Admission Policies"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: MutatingPolicyColumnId.name, id: MutatingPolicyColumnId.name },
          { className: "warning", showWithColumn: MutatingPolicyColumnId.name },
          { title: "Failure Policy", className: "failurePolicy", sortBy: MutatingPolicyColumnId.failurePolicy, id: MutatingPolicyColumnId.failurePolicy },
          { title: "Match Resources", className: "matchResources", id: MutatingPolicyColumnId.matchResources },
          { title: "Mutations (CEL)", className: "mutations", sortBy: MutatingPolicyColumnId.mutations, id: MutatingPolicyColumnId.mutations },
          { title: "Param Kind", className: "paramKind", id: MutatingPolicyColumnId.paramKind },
          { title: "Age", className: "age", sortBy: MutatingPolicyColumnId.age, id: MutatingPolicyColumnId.age },
        ]}
        renderTableContents={policy => [
          policy.getName(),
          <KubeObjectStatusIcon key="icon" object={policy} />,
          <Badge
            key="failurePolicy"
            label={policy.getFailurePolicy()}
            className={policy.getFailurePolicy() === "Fail" ? "badge-warning" : "badge-secondary"}
          />,
          policy.getMatchResourcesSummary(),
          <span key="cel" className="cel-code-snippet">
            {policy.getMutationsCount() > 0
              ? `${policy.getMutationsCount()} CEL mutation(s)`
              : "<none>"}
          </span>,
          policy.getParamKind(),
          <KubeObjectAge key="age" object={policy} />,
        ]}
      />
    );
  }

  private renderMutatingBindings() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="config_mutating_admission_policy_bindings"
        className="MutatingAdmissionPolicyBindings"
        store={this.props.mutatingBindingStore}
        sortingCallbacks={{
          [MutatingBindingColumnId.name]: binding => binding.getName(),
          [MutatingBindingColumnId.policyName]: binding => binding.getPolicyName(),
          [MutatingBindingColumnId.age]: binding => -binding.getCreationTimestamp(),
        }}
        searchFilters={[
          binding => binding.getSearchFields(),
          binding => binding.getPolicyName(),
        ]}
        renderHeaderTitle="Mutating Admission Policy Bindings"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: MutatingBindingColumnId.name, id: MutatingBindingColumnId.name },
          { className: "warning", showWithColumn: MutatingBindingColumnId.name },
          { title: "Policy", className: "policyName", sortBy: MutatingBindingColumnId.policyName, id: MutatingBindingColumnId.policyName },
          { title: "Param Ref", className: "paramRef", id: MutatingBindingColumnId.paramRef },
          { title: "Age", className: "age", sortBy: MutatingBindingColumnId.age, id: MutatingBindingColumnId.age },
        ]}
        renderTableContents={binding => [
          binding.getName(),
          <KubeObjectStatusIcon key="icon" object={binding} />,
          <Badge key="policy" label={binding.getPolicyName()} />,
          binding.getParamRefSummary(),
          <KubeObjectAge key="age" object={binding} />,
        ]}
      />
    );
  }

  render() {
    return (
      <SiblingsInTabLayout>
        <div className="ValidatingAdmissionPoliciesView" data-testid="validating-admission-policies-view">
          <div className="readonly-notice" data-testid="cel-readonly-notice">
            <strong>In-Tree CEL Policies:</strong>
            {" "}
            Validating and Mutating Admission Policies are evaluated natively by the kube-apiserver without external webhooks.
          </div>

          <Tabs
            className="view-tabs"
            value={this.activeTab}
            onChange={this.onTabChange}
          >
            <Tab
              value={AdmissionPolicyTab.VALIDATING_POLICIES}
              label="Validating Policies"
              id="tab-admission-policies"
            />
            <Tab
              value={AdmissionPolicyTab.VALIDATING_BINDINGS}
              label="Validating Bindings"
              id="tab-admission-policy-bindings"
            />
            <Tab
              value={AdmissionPolicyTab.MUTATING_POLICIES}
              label="Mutating Policies"
              id="tab-mutating-admission-policies"
            />
            <Tab
              value={AdmissionPolicyTab.MUTATING_BINDINGS}
              label="Mutating Bindings"
              id="tab-mutating-admission-policy-bindings"
            />
          </Tabs>

          {this.activeTab === AdmissionPolicyTab.VALIDATING_POLICIES && this.renderPolicies()}
          {this.activeTab === AdmissionPolicyTab.VALIDATING_BINDINGS && this.renderBindings()}
          {this.activeTab === AdmissionPolicyTab.MUTATING_POLICIES && this.renderMutatingPolicies()}
          {this.activeTab === AdmissionPolicyTab.MUTATING_BINDINGS && this.renderMutatingBindings()}
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const ValidatingAdmissionPolicies = withInjectables<Dependencies>(NonInjectedValidatingAdmissionPolicies, {
  getProps: (di) => ({
    policyStore: di.inject(validatingAdmissionPolicyStoreInjectable),
    bindingStore: di.inject(validatingAdmissionPolicyBindingStoreInjectable),
    mutatingPolicyStore: di.inject(mutatingAdmissionPolicyStoreInjectable),
    mutatingBindingStore: di.inject(mutatingAdmissionPolicyBindingStoreInjectable),
  }),
});
