import { Component, type ErrorInfo, type ReactNode } from "react";

/** A render error in one view must not blank the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Pheme view crashed:", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <h2>Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}.</h2>
        <p className="muted small">{this.state.error.message}</p>
        <div className="row">
          <button className="btn primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="btn" onClick={() => window.location.reload()}>Reload Pheme</button>
        </div>
      </div>
    );
  }
}
