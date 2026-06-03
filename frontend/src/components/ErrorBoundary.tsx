import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("Uncaught error captured by ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || '';
      
      // Determine user-friendly messages for API failure clues
      let title = "Something went wrong";
      let description = "An unexpected error occurred while rendering this page. Our team has been notified.";
      
      if (errorMsg.includes("403") || errorMsg.toLowerCase().includes("access denied") || errorMsg.toLowerCase().includes("unauthorized")) {
        title = "Access Denied";
        description = "You do not have the required permissions or roles to view this resource. Please contact your department administrator.";
      } else if (errorMsg.includes("413") || errorMsg.toLowerCase().includes("too large") || errorMsg.toLowerCase().includes("payload too large")) {
        title = "File / Payload Too Large";
        description = "The uploaded file exceeds the maximum permitted size limit of 10MB.";
      } else if (errorMsg.includes("422") || errorMsg.toLowerCase().includes("validation")) {
        title = "Data Validation Failed";
        description = "The server could not process the submitted parameters. Please review your inputs for correctness.";
      } else if (errorMsg.includes("404") || errorMsg.toLowerCase().includes("not found")) {
        title = "Resource Not Found";
        description = "The purchase request or budget resource you are looking for does not exist or has been removed.";
      } else if (errorMsg.includes("429") || errorMsg.toLowerCase().includes("too many requests") || errorMsg.toLowerCase().includes("rate limit")) {
        title = "Rate Limit Exceeded";
        description = "You have made too many requests in a short period. Please wait a moment and try again.";
      }

      return (
        <div className="min-h-[70vh] flex items-center justify-center p-6 bg-slate-50/50">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-fadeIn text-left">
            <div className="h-2 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
                  <ShieldAlert size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 leading-tight">{title}</h2>
                  <p className="text-xs text-slate-400 mt-1 font-semibold uppercase tracking-wider">System Render Error</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {description}
              </p>

              {this.state.error && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-[11px] text-slate-500 overflow-x-auto max-h-40">
                  <span className="font-bold text-slate-700 block mb-1">Error Trace:</span>
                  <p className="font-semibold">{this.state.error.toString()}</p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="mt-2 text-slate-400 leading-normal">{this.state.errorInfo.componentStack}</pre>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={this.handleReload}
                  className="flex-1 btn-primary py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#1a3a6b]/90 text-white font-semibold text-xs border-none shadow-md"
                >
                  <RefreshCw size={14} /> Reload Page
                </button>
                <button
                  onClick={this.handleGoHome}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  <Home size={14} /> Go Home
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
