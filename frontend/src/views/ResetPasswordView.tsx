import React from 'react';
import { ResetPassword, ResetPasswordProps } from './auth/ResetPassword';

export interface ResetPasswordViewProps extends ResetPasswordProps {}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = (props) => {
  return <ResetPassword {...props} />;
};

export default ResetPasswordView;
