import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ValueFolio App Error:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0E14] text-white flex items-center justify-center p-6 text-center font-['Plus_Jakarta_Sans',sans-serif]">
          <div className="max-w-md bg-[#151923] border border-[#232936] p-8 rounded-2xl space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h2 className="text-xl font-bold">ValueFolio Application Reset Required</h2>
            <p className="text-xs text-slate-400">
              {this.state.error?.message || 'A browser state mismatch occurred. Reset local state to reload.'}
            </p>
            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="bg-[#1E2536] hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-[#2B354C] text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
              >
                Reset Cache &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
