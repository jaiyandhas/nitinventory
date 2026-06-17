import React from 'react';
import { TechEvalAction } from './TechEvalAction';
import { PurchaseRequest } from '../../../types';

interface CommitteeSignActionProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
  sendBackCandidates: any[];
  onReject: (remarks: string) => Promise<void>;
  onSendBack: (step: number, remarks: string) => Promise<void>;
  showSendBackModal: boolean;
  setShowSendBackModal: (show: boolean) => void;
  selectedSendBackStep: number | '';
  setSelectedSendBackStep: (step: number | '') => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

export const CommitteeSignAction: React.FC<CommitteeSignActionProps> = (props) => {
  return <TechEvalAction {...props} />;
};
