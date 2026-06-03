import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi, budgetApi } from '../services/api';
import { toast } from 'react-hot-toast';
import { RotateCw, RotateCcw, ZoomIn, ZoomOut, Upload, User as UserIcon, Shield, Users, Save } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  
  // Profile fields state
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [gender, setGender] = useState('male');
  const [submitting, setSubmitting] = useState(false);

  // Image editing states
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  const canvasWidth = 400;
  const canvasHeight = 150;

  // Committee states for HOD
  const [committee, setCommittee] = useState<any>(null);
  const [deptFaculties, setDeptFaculties] = useState<any[]>([]);
  const [expert1Id, setExpert1Id] = useState<string>('');
  const [expert2Id, setExpert2Id] = useState<string>('');
  const [loadingCommittee, setLoadingCommittee] = useState(false);
  const [savingCommittee, setSavingCommittee] = useState(false);

  // Committee states for Director
  const [allCommittees, setAllCommittees] = useState<any[]>([]);
  const [allFaculties, setAllFaculties] = useState<any[]>([]);
  const [loadingAllCommittees, setLoadingAllCommittees] = useState(false);
  const [selectedNominees, setSelectedNominees] = useState<Record<number, string>>({});

  // Initialize fields with current user details
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setDesignation(user.designation || '');
      setGender(user.gender || 'male');
      if (user.signature_path) {
        const sigUrl = user.signature_path.startsWith('http') || user.signature_path.startsWith('/')
          ? user.signature_path
          : `/${user.signature_path}`;
        setCroppedPreview(sigUrl);
      }
    }
  }, [user]);

  // Load committee config based on user role
  useEffect(() => {
    if (!user) return;
    const isHodUser = user.role?.group_key === 'hod';
    const isDirectorUser = user.role?.value === 'director' || user.role?.group_key === 'admin';

    if (isHodUser) {
      setLoadingCommittee(true);
      Promise.all([
        budgetApi.getDepartmentCommittee(),
        budgetApi.departmentFaculty()
      ])
        .then(([commRes, facRes]) => {
          setCommittee(commRes.data);
          setDeptFaculties(facRes.data);
          setExpert1Id(commRes.data?.expert1_id ? String(commRes.data.expert1_id) : '');
          setExpert2Id(commRes.data?.expert2_id ? String(commRes.data.expert2_id) : '');
        })
        .catch((err) => {
          console.error('Failed to load HOD committee details', err);
        })
        .finally(() => setLoadingCommittee(false));
    }

    if (isDirectorUser) {
      setLoadingAllCommittees(true);
      Promise.all([
        budgetApi.directorGetCommittees(),
        budgetApi.allFaculties()
      ])
        .then(([commRes, facRes]) => {
          setAllCommittees(commRes.data);
          setAllFaculties(facRes.data);
          
          const nomineesMap: Record<number, string> = {};
          commRes.data.forEach((c: any) => {
            nomineesMap[c.department_id] = c.director_faculty_id ? String(c.director_faculty_id) : '';
          });
          setSelectedNominees(nomineesMap);
        })
        .catch((err) => {
          console.error('Failed to load Director committee details', err);
        })
        .finally(() => setLoadingAllCommittees(false));
    }
  }, [user]);

  const handleUpdateCommittee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expert1Id || !expert2Id) {
      toast.error('Both Expert 1 and Expert 2 must be selected.');
      return;
    }
    if (expert1Id === expert2Id) {
      toast.error('Expert 1 and Expert 2 must be different faculty members.');
      return;
    }
    setSavingCommittee(true);
    try {
      await budgetApi.updateDepartmentCommittee({
        expert1_id: Number(expert1Id),
        expert2_id: Number(expert2Id)
      });
      toast.success('Department committee experts updated successfully!');
      const commRes = await budgetApi.getDepartmentCommittee();
      setCommittee(commRes.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update department committee.');
    } finally {
      setSavingCommittee(false);
    }
  };

  const handleUpdateDirectorNominee = async (departmentId: number) => {
    const nomineeId = selectedNominees[departmentId] || '';
    try {
      await budgetApi.directorUpdateCommittee({
        department_id: departmentId,
        director_faculty_id: nomineeId ? Number(nomineeId) : null
      });
      toast.success('Director nominee updated successfully!');
      const commRes = await budgetApi.directorGetCommittees();
      setAllCommittees(commRes.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update Director nominee.');
    }
  };

  // Load image on file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageSrc(reader.result);
        const img = new Image();
        img.onload = () => {
          setImageObj(img);
          // Auto-calculate initial zoom scale to fit the canvas nicely
          const scaleX = canvasWidth / img.width;
          const scaleY = canvasHeight / img.height;
          const initialScale = Math.max(scaleX, scaleY, 0.2);
          setZoom(Math.min(initialScale, 1.5));
          setRotation(0);
          setOffsetX(0);
          setOffsetY(0);
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  // Draw image on canvas whenever translation, rotation, zoom, or image changes
  useEffect(() => {
    if (!canvasRef.current || !imageObj) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Fill white background for the signature output
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.save();
    // Translate origin to the center of canvas plus the user drag offset
    ctx.translate(canvasWidth / 2 + offsetX, canvasHeight / 2 + offsetY);
    // Apply rotation (in radians)
    ctx.rotate((rotation * Math.PI) / 180);
    // Apply scale (zoom)
    ctx.scale(zoom, zoom);
    // Draw the image centered
    ctx.drawImage(imageObj, -imageObj.width / 2, -imageObj.height / 2);
    ctx.save();
    ctx.restore();
  }, [imageObj, zoom, rotation, offsetX, offsetY]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageObj) return;
    isDragging.current = true;
    startX.current = e.clientX - offsetX;
    startY.current = e.clientY - offsetY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setOffsetX(e.clientX - startX.current);
    setOffsetY(e.clientY - startY.current);
  };

  const handleMouseUpOrLeave = () => {
    isDragging.current = false;
  };

  // Touch drag handlers for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!imageObj || e.touches.length !== 1) return;
    isDragging.current = true;
    startX.current = e.touches[0].clientX - offsetX;
    startY.current = e.touches[0].clientY - offsetY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || e.touches.length !== 1) return;
    setOffsetX(e.touches[0].clientX - startX.current);
    setOffsetY(e.touches[0].clientY - startY.current);
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  const rotate = (angle: number) => {
    setRotation((prev) => (prev + angle + 360) % 360);
  };

  // Get cropped signature image from canvas as Blob
  const getCanvasBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!canvasRef.current) return resolve(null);
      canvasRef.current.toBlob((blob) => resolve(blob), 'image/png');
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !designation) {
      toast.error('Name and Designation are required.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('designation', designation);
      formData.append('gender', gender);

      if (imageObj) {
        const blob = await getCanvasBlob();
        if (blob) {
          formData.append('signature', blob, 'signature.png');
        }
      }

      const res = await authApi.updateProfile(formData);
      toast.success('Profile updated successfully!');
      
      // Update cropped signature preview
      if (res.data.signature_path) {
        const finalSigUrl = res.data.signature_path.startsWith('http') || res.data.signature_path.startsWith('/')
          ? res.data.signature_path
          : `/${res.data.signature_path}`;
        setCroppedPreview(finalSigUrl);
        setImageSrc(null);
        setImageObj(null);
      }
      
      // Reload page to refresh auth state/context
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="page-header">My Profile Settings</h1>
        <p className="page-subtitle">Configure your personal information and digital signature</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Details Form */}
        <div className="md:col-span-2 card p-6 bg-white border border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2 mb-2">
              <UserIcon size={18} className="text-[#1a3a6b]" /> Personal Details
            </h3>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field w-full"
                placeholder="Enter full name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={user?.email || ''}
                className="input-field w-full bg-slate-50 cursor-not-allowed text-slate-500"
                disabled
              />
              <p className="text-[10px] text-slate-400 mt-1">Contact administrator to change email.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Designation</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="input-field w-full"
                  placeholder="e.g. Assistant Professor"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">System Authorization Group</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-[#f4f7fb] text-[#1a3a6b] rounded text-sm font-semibold">
                <Shield size={16} />
                <span>{user?.role?.name || 'Standard User'}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary py-2 px-6 font-semibold shadow-md"
              >
                {submitting ? 'Saving Changes...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* Signature Box */}
        <div className="card p-6 bg-white border border-slate-200 space-y-4">
          <h3 className="text-md font-bold text-slate-800">Signature Preview</h3>
          
          <div className="border border-slate-200 rounded-md p-2 bg-[#fafbfc] flex items-center justify-center min-h-[120px]">
            {croppedPreview ? (
              <img
                src={croppedPreview}
                alt="Active Signature"
                className="max-h-24 max-w-full object-contain mix-blend-multiply"
              />
            ) : (
              <p className="text-xs text-slate-400 italic">No signature uploaded yet</p>
            )}
          </div>
          
          <p className="text-xs text-slate-500 leading-relaxed">
            This signature will be appended to purchase requests and action logs you approve across the system.
          </p>
        </div>
      </div>

      {/* Department Committee Configuration (HOD Only) */}
      {user?.role?.group_key === 'hod' && (
        <div className="card p-6 bg-white border border-slate-200 space-y-4">
          <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-[#1a3a6b]" /> Department Purchase Committee Settings
          </h3>
          <p className="text-xs text-slate-500">
            As HOD, configure the two department experts who will serve on the 5-member purchase committee for technical evaluation.
          </p>

          {loadingCommittee ? (
            <div className="text-sm text-slate-500 py-4 italic">Loading committee details...</div>
          ) : (
            <form onSubmit={handleUpdateCommittee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Expert Nominated by HOD 1 *
                  </label>
                  <select
                    value={expert1Id}
                    onChange={(e) => setExpert1Id(e.target.value)}
                    className="input-field w-full"
                    required
                  >
                    <option value="">Select Expert 1</option>
                    {deptFaculties.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Expert Nominated by HOD 2 *
                  </label>
                  <select
                    value={expert2Id}
                    onChange={(e) => setExpert2Id(e.target.value)}
                    className="input-field w-full"
                    required
                  >
                    <option value="">Select Expert 2</option>
                    {deptFaculties.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Show full committee info preview */}
              <div className="bg-slate-50 border border-slate-200 rounded p-4 text-xs space-y-2">
                <div className="font-bold text-slate-700 uppercase tracking-wide">
                  Preview: Full 5-Member Committee
                </div>
                <ol className="list-decimal list-inside space-y-1.5 font-medium text-slate-600">
                  <li>
                    <span className="font-bold">HOD / Chairperson:</span> {user?.name || 'You'}
                  </li>
                  <li>
                    <span className="font-bold">Purchase Initiator:</span> (The faculty initiating the PR)
                  </li>
                  <li>
                    <span className="font-bold">Expert Nominated by HOD 1:</span>{' '}
                    {deptFaculties.find((f) => String(f.id) === expert1Id)?.name || (
                      <span className="text-red-500 italic">Not Selected</span>
                    )}
                  </li>
                  <li>
                    <span className="font-bold">Expert Nominated by HOD 2:</span>{' '}
                    {deptFaculties.find((f) => String(f.id) === expert2Id)?.name || (
                      <span className="text-red-500 italic">Not Selected</span>
                    )}
                  </li>
                  <li>
                    <span className="font-bold">Faculty Nominated by Director:</span>{' '}
                    {committee?.director_faculty?.name || (
                      <span className="text-orange-500 italic">
                        {committee?.director_faculty_id
                          ? 'Loading...'
                          : 'Pending Nomination by Director'}
                      </span>
                    )}
                  </li>
                </ol>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingCommittee}
                  className="btn-primary py-2 px-6 font-semibold shadow-md flex items-center gap-2"
                >
                  <Save size={16} />
                  {savingCommittee ? 'Updating Committee...' : 'Save Committee Settings'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Director Department Nominations (Director / Admin Only) */}
      {(user?.role?.value === 'director' || user?.role?.group_key === 'admin') && (
        <div className="card p-6 bg-white border border-slate-200 space-y-4">
          <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-[#1a3a6b]" /> Director Nominations for Department Committees
          </h3>
          <p className="text-xs text-slate-500">
            Nominate a faculty representative from any department across the institute to serve on each department's 5-member purchase committee.
          </p>

          {loadingAllCommittees ? (
            <div className="text-sm text-slate-500 py-4 italic">Loading department committees...</div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="p-3">Department</th>
                    <th className="p-3">HOD Experts</th>
                    <th className="p-3">Director Nominated Faculty *</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {allCommittees.map((c) => {
                    const currentNomineeVal = selectedNominees[c.department_id] || '';
                    return (
                      <tr key={c.department_id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800">
                          <div>{c.department_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {c.department_code}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="space-y-0.5">
                            <div>
                              <span className="font-semibold text-slate-500">Expert 1:</span>{' '}
                              {c.expert1?.name || <span className="text-red-500 italic">Not set</span>}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-500">Expert 2:</span>{' '}
                              {c.expert2?.name || <span className="text-red-500 italic">Not set</span>}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <select
                            value={currentNomineeVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedNominees((prev) => ({
                                ...prev,
                                [c.department_id]: val,
                              }));
                            }}
                            className="input-field py-1 px-2 text-xs w-full max-w-[240px]"
                          >
                            <option value="">Select Nominee</option>
                            {allFaculties.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name} ({f.email})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleUpdateDirectorNominee(c.department_id)}
                            className="btn-primary py-1 px-3 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Save size={12} />
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Signature Uploader, Cropper & Rotator Editor */}
      <div className="card p-6 bg-white border border-slate-200 space-y-6">
        <div>
          <h3 className="text-md font-bold text-slate-800">Update Signature File</h3>
          <p className="text-xs text-slate-500 mt-0.5">Upload a clear scan of your handwritten signature, rotate and crop it to match the dimensions.</p>
        </div>

        <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-md hover:border-slate-400 bg-slate-50/50 transition-colors">
          <label className="flex flex-col items-center justify-center cursor-pointer space-y-2 py-4">
            <Upload className="w-8 h-8 text-slate-400" />
            <span className="text-sm font-semibold text-[#1a3a6b] hover:underline">Select Image File</span>
            <span className="text-xs text-slate-400">PNG, JPG, or JPEG</span>
            <span className="text-[10px] text-amber-600 font-semibold mt-1">💡 For the best digital signature quality, please crop tightly and remove the image background before uploading.</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {imageSrc && (
          <div className="space-y-4 border-t border-slate-100 pt-6 flex flex-col items-center">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Canvas Signature Editor</h4>
            
            {/* Canvas Editor Container with Border Bounding Box */}
            <div className="relative border-4 border-dashed border-[#1a3a6b] bg-white rounded shadow-md overflow-hidden cursor-move">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="block select-none touch-none"
              />
              {/* Pan Overlay Indicator */}
              <div className="absolute top-2 right-2 bg-slate-800/60 text-white text-[9px] px-1.5 py-0.5 rounded pointer-events-none select-none">
                Drag to Pan
              </div>
            </div>

            {/* Interactive Canvas Editor Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => rotate(-90)}
                className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                title="Rotate 90 deg counter-clockwise"
              >
                <RotateCcw size={14} /> Rotate Left
              </button>
              
              <button
                type="button"
                onClick={() => rotate(90)}
                className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                title="Rotate 90 deg clockwise"
              >
                <RotateCw size={14} /> Rotate Right
              </button>

              <div className="w-px h-6 bg-slate-200 mx-1"></div>

              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(prev - 0.1, 0.1))}
                className="btn-secondary p-1.5 rounded-full"
                title="Zoom Out"
              >
                <ZoomOut size={16} />
              </button>

              <span className="text-xs font-semibold text-slate-500 font-mono w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>

              <button
                type="button"
                onClick={() => setZoom((prev) => Math.min(prev + 0.1, 4.0))}
                className="btn-secondary p-1.5 rounded-full"
                title="Zoom In"
              >
                <ZoomIn size={16} />
              </button>
            </div>
            
            <p className="text-[10px] text-slate-400 italic text-center">
              Zoom and position your signature cleanly within the box frame before saving.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

