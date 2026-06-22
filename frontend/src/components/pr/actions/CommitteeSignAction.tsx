import React from 'react';
import { TechEvalAction } from './TechEvalAction';
import { PurchaseRequest } from '../../../types';

interface CommitteeSignActionProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
  hasPrevStep: boolean;
  isLastStep: boolean;
  onReject: (remarks: string) => Promise<void>;
  onSendBack: (remarks: string) => Promise<void>;
  showSendBackModal: boolean;
  setShowSendBackModal: (show: boolean) => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

export const CommitteeSignAction: React.FC<CommitteeSignActionProps> = (props) => {
  return <TechEvalAction {...props} />;
};
