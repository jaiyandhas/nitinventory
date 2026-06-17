import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Eye, EyeOff, Loader2, ArrowRight, UploadCloud, CheckCircle } from 'lucide-react';
import { authApi } from '../services/api';
import { TitleSelect, DesignationSelect } from '../components/UserFormFields';
import toast from 'react-hot-toast';

interface Dept {
  id: number;
  name: string;
  short_code: string;
}

interface Role {
  id: number;
  name: string;
  value: string;
  group_key: string;
}

export const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [designation, setDesignation] = useState('');
  const [deptId, setDeptId] = useState('');
  const [title, setTitle] = useState('Mr.');
  const [signature, setSignature] = useState<File | null>(null);
  const [sigPreview, setSigPreview] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Dept[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const deptsRes = await authApi.departments();
        setDepartments(deptsRes.data);
        const desigsRes = await authApi.designations();
        setDesignations(desigsRes.data);
      } catch (err: unknown) {
        toast.error('Failed to load onboarding options');
      }
    };
    fetchOptions();
  }, []);

  useEffect(() => {
    if (designations.length > 0 && !designation) {
      setDesignation(designations[0]);
    }
  }, [designations, designation]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file (PNG/JPG) for the signature');
        return;
      }
      setSignature(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSigPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptId) {
      toast.error('Please select a department');
      return;
    }
    if (!signature) {
      toast.error('Please upload your digital signature image');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('password', password);
      formData.append('designation', designation);
      formData.append('department_id', deptId);
      formData.append('title', title);
      formData.append('signature', signature);

      await authApi.register(formData);
      setSuccess(true);
      toast.success('Registration request submitted successfully!');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="login-page-container">
        <div className="login-bg-image" />
        <div className="login-bg-overlay" />

        <div className="w-full max-w-md relative z-10">
          <div className="glass-login-card p-8 text-center space-y-6">
            <div className="flex justify-center">
              <CheckCircle className="w-16 h-16 text-emerald-600 animate-bounce" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Registration Submitted</h2>
            <p className="text-slate-600 text-sm">
              Thank you for registering on NIT Inventory. Your account request (including your digital signature) has been sent to the Administrator for approval.
            </p>
            <p className="text-slate-500 text-xs font-semibold">
              You will be able to log in once your profile is verified and approved.
            </p>
            <div className="pt-4">
              <Link
                to="/login"
                className="glass-login-btn w-full inline-flex items-center justify-center gap-2 py-2.5"
              >
                Return to Login <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page-container py-12">
      <div className="login-bg-image" />
      <div className="login-bg-overlay" />

      <div className="w-full max-w-lg relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <img src="/NITLOGO.png" alt="NIT Logo" className="w-16 h-16 object-contain mx-auto mb-3 drop-shadow-sm" />
          <h1 className="text-3xl font-bold text-[#1a3a6b]">NIT Inventory</h1>
          <p className="text-sm text-slate-700 font-semibold">Faculty & HOD Onboarding</p>
          <p className="text-xs text-slate-500 mt-0.5">National Institute of Technology, Tiruchirappalli</p>
        </div>

        {/* Card */}
        <div className="glass-login-card p-8 shadow-xl">
          <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-200 pb-3">
            Create Onboarding Request
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="glass-login-label">Full Name</label>
                <div className="flex gap-2">
                  <TitleSelect
                    value={title}
                    onChange={setTitle}
                    className="glass-login-input w-24 shrink-0"
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="glass-login-input flex-1"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="glass-login-label">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@nitt.edu"
                  className="glass-login-input"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="glass-login-label">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="glass-login-input pr-10"
                    required
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

              <div>
                <label className="glass-login-label">Designation</label>
                <DesignationSelect
                  value={designation}
                  onChange={setDesignation}
                  designations={designations}
                  className="glass-login-input"
                />
              </div>
            </div>

            <div>
              <label className="glass-login-label">Department</label>
              <select
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="glass-login-input"
                required
              >
                <option value="">Select Dept</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.short_code} - {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Signature Upload */}
            <div>
              <label className="glass-login-label">Digital Signature Image</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-slate-400 transition-colors bg-white/40 backdrop-blur-md relative group">
                <div className="space-y-1 text-center">
                  <UploadCloud className="mx-auto h-12 w-12 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  <div className="flex text-sm text-slate-600">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-transparent rounded-md font-semibold text-[#1a3a6b] hover:text-[#12284c] focus-within:outline-none">
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        name="signature"
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-slate-500">PNG, JPG up to 2MB</p>
                  <p className="text-[10px] text-amber-700 font-semibold mt-1">💡 For the best digital signature quality, please crop tightly and remove the image background before uploading.</p>
                </div>
              </div>
              
              {sigPreview && (
                <div className="mt-3 p-3 bg-white/50 backdrop-blur-md border border-slate-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={sigPreview} alt="Signature preview" className="h-10 w-24 object-contain border border-slate-200 p-1 bg-slate-50 rounded" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Signature Loaded</p>
                      <p className="text-[10px] text-slate-500">{signature?.name}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSignature(null);
                      setSigPreview(null);
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-login-btn mt-4"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>Submit Onboarding Request <UserPlus size={16} /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[#1a3a6b] hover:text-[#12284c] transition-colors hover:underline">
              Sign In
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
