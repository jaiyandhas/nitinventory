import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Eye, EyeOff, Loader2, ArrowRight, UploadCloud, CheckCircle } from 'lucide-react';
import { authApi } from '../services/api';
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
  const [gender, setGender] = useState('Male');
  const [deptId, setDeptId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [signature, setSignature] = useState<File | null>(null);
  const [sigPreview, setSigPreview] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Dept[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [deptsRes, rolesRes] = await Promise.all([
          authApi.departments(),
          authApi.roles(),
        ]);
        setDepartments(deptsRes.data);
        // Only show appropriate onboarding roles (like HOD, Faculty) for security
        // and filter out admin/apex if needed, but let's show all selectable roles
        setRoles(rolesRes.data);
      } catch (err: unknown) {
        toast.error('Failed to load department and role options');
      }
    };
    fetchOptions();
  }, []);

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
    if (!roleId) {
      toast.error('Please select a system role');
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
      formData.append('gender', gender);
      formData.append('role_id', deptId ? roleId : ''); // backend takes int
      formData.append('department_id', deptId);
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
      <div className="min-h-screen formal-bg flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md card p-8 text-center space-y-6">
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
              className="btn-primary w-full inline-flex items-center justify-center gap-2 py-2.5"
            >
              Return to Login <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen formal-bg flex flex-col items-center justify-center p-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <img src="/NITLOGO.png" alt="NIT Logo" className="w-16 h-16 object-contain mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-[#1a3a6b]">NIT Inventory</h1>
          <p className="text-sm text-slate-600 font-medium">Faculty & HOD Onboarding</p>
          <p className="text-xs text-slate-500 mt-0.5">National Institute of Technology, Tiruchirappalli</p>
        </div>

        {/* Card */}
        <div className="card p-8 shadow-xl">
          <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-200 pb-2">
            Create Onboarding Request
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. John Doe"
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="label">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@nitt.edu"
                  className="input-field"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field pr-10"
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
                <label className="label">Designation</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="Associate Professor"
                  className="input-field"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="input-field"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="label">Department</label>
                <select
                  value={deptId}
                  onChange={(e) => setDeptId(e.target.value)}
                  className="input-field"
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

              <div>
                <label className="label">System Role</label>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select Role</option>
                  {roles
                    .filter((r) => r.group_key !== 'admin') // admin can't be onboarded from public page
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Signature Upload */}
            <div>
              <label className="label">Digital Signature Image (for signing documents)</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-slate-400 transition-colors bg-slate-50 relative group">
                <div className="space-y-1 text-center">
                  <UploadCloud className="mx-auto h-12 w-12 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  <div className="flex text-sm text-slate-600">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-semibold text-[#1a3a6b] hover:text-[#142d54] focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
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
                  <p className="text-[10px] text-amber-600 font-semibold mt-1">💡 For the best digital signature quality, please crop tightly and remove the image background before uploading.</p>
                </div>
              </div>
              
              {sigPreview && (
                <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
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
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 mt-4"
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
            <Link to="/login" className="font-semibold text-[#1a3a6b] hover:underline">
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
