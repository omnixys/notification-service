// src/auth/registration/dto/signup-verification-cache.dto.ts

import type {
  AddSecurityQuestionInput,
  UserAddressInput,
} from '@omnixys/graphql';

export interface SignupVerificationCacheDTO<TCreateUserInput> {
  input: TCreateUserInput;

  meta: {
    createdAt: string; //  ISO
    ip?: string;
    userAgent?: string;
  };
}

// user/models/dto/signup-user-cache.dto.ts
export interface SignupUserCacheDTO<TUserPayload> {
  userData: TUserPayload;
  meta: {
    createdAt: string;
    ip?: string;
    userAgent?: string;
  };
}

export interface SignupAddressCacheDTO {
  addresses?: UserAddressInput[];
  meta: {
    createdAt: string;
    ip?: string;
    userAgent?: string;
  };
}

export interface SignupAuthCacheDTO {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  securityQuestions?: AddSecurityQuestionInput[];
  meta: {
    createdAt: string;
    ip?: string;
    userAgent?: string;
  };
}
