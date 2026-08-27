"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CanvasErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Canvas] Error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              height: "100%",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--background)",
              color: "var(--muted-foreground)",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13 }}>Canvas failed to load</span>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                fontSize: 12,
                padding: "6px 16px",
                background: "var(--primary)",
                color: "var(--background)",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
