import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      const redirectPath = sessionStorage.getItem("redirect_after_login");
      if (redirectPath) {
        sessionStorage.removeItem("redirect_after_login");
        navigate(redirectPath);
      } else {
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Login failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      {/* Background and Ambient Orbs */}
      <div className="login-bg-image" />
      <div className="login-bg-overlay" />
      <div className="login-ambient-orb orb-1" />
      <div className="login-ambient-orb orb-2" />
      <div className="login-ambient-orb orb-3" />

      {/* Main Content */}
      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <img
            src="/NITLOGO.png"
            alt="NIT Logo"
            className="w-20 h-20 object-contain mx-auto mb-4 drop-shadow-sm"
          />
          <h1 className="text-3xl font-bold text-[#1a3a6b]">
            STORES AND PURCHASE MANAGEMENT{" "}
          </h1>

          <p className="text-xs text-slate-500 mt-0.5">
            National Institute of Technology, Tiruchirappalli
          </p>
        </div>

        {/* Card */}
        <div className="glass-login-card p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-200 pb-3">
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label className="glass-login-label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@nitt.edu"
                className="glass-login-input"
                required
                autoComplete="off"
                autoFocus
              />
            </div>

            <div>
              <label className="glass-login-label">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="glass-login-input pr-10"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-login-btn mt-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 text-center text-sm text-slate-600">
            Need to onboard?{" "}
            <Link
              to="/register"
              className="font-semibold text-[#1a3a6b] hover:text-[#12284c] transition-colors hover:underline"
            >
              Register here
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} NIT Tiruchirappalli — NIT Inventory v1.0
        </p>
      </div>
    </div>
  );
};
