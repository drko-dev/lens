/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { editor } from "monaco-editor";
import React from "react";
import type { MonacoEditorProps, MonacoEditorRef } from "../monaco-editor";
import type { MonacoDiffEditorProps } from "../monaco-diff-editor";
import { monacoValidators } from "../monaco-validators";

class FakeMonacoEditor extends React.Component<MonacoEditorProps> {
  render() {
    const { id, value, onChange, onError, language = "yaml" } = this.props;

    return (
      <textarea
        data-testid={`monaco-editor-for-${id}`}

        onChange={(event) => {
          const newValue = event.target.value;

          onChange?.(
            newValue,
            {} as editor.IModelContentChangedEvent,
          );

          const validator = monacoValidators[language];

          try {
            validator(newValue);
            onError?.(null);
          } catch(e) {
            onError?.(e);
          }
        }}
        value={value}
      />
    );
  }
}

export const MonacoEditor = React.forwardRef<
  MonacoEditorRef,
  MonacoEditorProps
>((props, ref) => <FakeMonacoEditor innerRef={ref} {...props} />);

class FakeMonacoDiffEditor extends React.Component<MonacoDiffEditorProps> {
  render() {
    const { id, original, modified, originalTitle, modifiedTitle, onChange } = this.props;

    return (
      <div data-testid={`monaco-diff-editor-for-${id || "diff"}`}>
        <div data-testid="diff-original-title">{originalTitle}</div>
        <textarea
          data-testid={`monaco-diff-original-for-${id || "diff"}`}
          readOnly
          value={original}
        />
        <div data-testid="diff-modified-title">{modifiedTitle}</div>
        <textarea
          data-testid={`monaco-diff-modified-for-${id || "diff"}`}
          value={modified}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    );
  }
}

export const MonacoDiffEditor = FakeMonacoDiffEditor;

