/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./monaco-diff-editor.module.scss";
import React from "react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import { action, computed, makeObservable, observable, reaction } from "mobx";
import { editor } from "monaco-editor";
import type { MonacoTheme } from "./monaco-themes";
import { cssNames, disposer } from "@openlens/utilities";
import type { LensTheme } from "../../themes/lens-theme";
import { withInjectables } from "@ogre-tools/injectable-react";
import activeThemeInjectable from "../../themes/active.injectable";
import autoBindReact from "auto-bind/react";
import type { UserPreferencesState } from "../../../features/user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { Icon } from "../icon";
import { createMonacoUri } from "./monaco-uri";
import { flushMonacoRelease } from "./release-monaco-models";
import { merge } from "lodash";

export interface MonacoDiffEditorProps {
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  original: string;
  modified: string;
  originalTitle?: string;
  modifiedTitle?: string;
  readOnlyOriginal?: boolean; // default: true
  readOnlyModified?: boolean; // default: false
  renderSideBySide?: boolean; // default: true
  language?: "yaml" | "json";
  onChange?(modifiedValue: string): void;
  options?: Partial<editor.IStandaloneDiffEditorConstructionOptions>;
}

interface Dependencies {
  state: UserPreferencesState;
  activeTheme: IComputedValue<LensTheme>;
}

@observer
class NonInjectedMonacoDiffEditor extends React.Component<MonacoDiffEditorProps & Dependencies> {
  static defaultProps = {
    language: "yaml" as const,
    readOnlyOriginal: true,
    readOnlyModified: false,
    renderSideBySide: true,
  };

  private staticId = `diff-editor-id#${Math.round(1e7 * Math.random())}`;
  private dispose = disposer();

  @observable.ref containerElem: HTMLDivElement | null = null;
  @observable.ref diffEditor!: editor.IStandaloneDiffEditor;
  @observable.ref originalModel!: editor.ITextModel;
  @observable.ref modifiedModel!: editor.ITextModel;
  @observable unmounting = false;

  constructor(props: MonacoDiffEditorProps & Dependencies) {
    super(props);
    makeObservable(this);
    autoBindReact(this);
  }

  @computed get id(): string {
    return this.props.id ?? this.staticId;
  }

  @computed get theme(): MonacoTheme {
    return this.props.activeTheme.get().monacoTheme;
  }

  @computed get options(): editor.IStandaloneDiffEditorConstructionOptions {
    return merge(
      {},
      this.props.state.editorConfiguration,
      {
        originalEditable: !this.props.readOnlyOriginal,
        readOnly: this.props.readOnlyModified,
        renderSideBySide: this.props.renderSideBySide,
        automaticLayout: true,
      },
      this.props.options,
    );
  }

  componentDidMount() {
    this.createEditor();
  }

  componentWillUnmount() {
    this.unmounting = true;
    this.dispose();

    if (this.diffEditor) {
      this.diffEditor.dispose();
    }

    if (this.originalModel && !this.originalModel.isDisposed()) {
      this.originalModel.dispose();
    }

    flushMonacoRelease(this.id);
  }

  private bindResizeObserver() {
    if (!this.containerElem) {
      return () => {};
    }

    const resizeObserver = new ResizeObserver(() => {
      this.diffEditor?.layout();
    });

    resizeObserver.observe(this.containerElem);

    return () => resizeObserver.disconnect();
  }

  protected createEditor() {
    if (!this.containerElem || this.diffEditor || this.unmounting) {
      return;
    }

    const { language = "yaml", original, modified } = this.props;
    const originalUri = createMonacoUri(`${this.id}-diff-original`);
    const modifiedUri = createMonacoUri(this.id);

    const existingOriginal = editor.getModel(originalUri);

    if (existingOriginal && !existingOriginal.isDisposed()) {
      existingOriginal.setValue(original);
      this.originalModel = existingOriginal;
    } else {
      this.originalModel = editor.createModel(original, language, originalUri);
    }

    const existingModified = editor.getModel(modifiedUri);

    if (existingModified && !existingModified.isDisposed()) {
      if (existingModified.getValue() !== modified) {
        existingModified.setValue(modified);
      }
      this.modifiedModel = existingModified;
    } else {
      this.modifiedModel = editor.createModel(modified, language, modifiedUri);
    }

    this.diffEditor = editor.createDiffEditor(this.containerElem, {
      theme: this.theme,
      ...this.options,
    });

    this.diffEditor.setModel({
      original: this.originalModel,
      modified: this.modifiedModel,
    });

    const onModifiedChangeDisposer = this.modifiedModel.onDidChangeContent(() => {
      const val = this.modifiedModel.getValue();

      this.props.onChange?.(val);
    });

    this.dispose.push(
      () => onModifiedChangeDisposer.dispose(),
      reaction(
        () => this.theme,
        theme => editor.setTheme(theme),
      ),
      reaction(
        () => this.props.original,
        val => {
          if (this.originalModel && !this.originalModel.isDisposed() && this.originalModel.getValue() !== val) {
            this.originalModel.setValue(val);
          }
        },
      ),
      reaction(
        () => this.props.modified,
        val => {
          if (this.modifiedModel && !this.modifiedModel.isDisposed() && this.modifiedModel.getValue() !== val) {
            this.modifiedModel.setValue(val);
          }
        },
      ),
      reaction(
        () => this.options,
        opts => this.diffEditor?.updateOptions(opts),
      ),
      this.bindResizeObserver(),
    );
  }

  @action
  focus() {
    this.diffEditor?.getModifiedEditor().focus();
  }

  render() {
    const { className, style, originalTitle, modifiedTitle } = this.props;

    return (
      <div
        data-testid="monaco-diff-editor"
        className={cssNames(styles.MonacoDiffEditor, className)}
        style={style}
      >
        {(originalTitle || modifiedTitle) && (
          <div className={styles.DiffHeader} data-testid="diff-editor-header">
            <div className={styles.PaneTitle} data-testid="diff-original-title">
              <Icon material="history" small />
              <span>{originalTitle || "Original"}</span>
            </div>
            <div className={styles.PaneTitle} data-testid="diff-modified-title">
              <Icon material="edit_note" small />
              <span>{modifiedTitle || "Modified"}</span>
            </div>
          </div>
        )}
        <div
          className={styles.DiffContainer}
          ref={elem => this.containerElem = elem}
          data-testid="monaco-diff-editor-container"
        />
      </div>
    );
  }
}

export const MonacoDiffEditor = withInjectables<Dependencies, MonacoDiffEditorProps>(
  NonInjectedMonacoDiffEditor,
  {
    getProps: (di, props) => ({
      ...props,
      state: di.inject(userPreferencesStateInjectable),
      activeTheme: di.inject(activeThemeInjectable),
    }),
  },
);
