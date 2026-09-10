import type { User } from '@/features/auth/types';
import { baseApi } from './baseApi';
import type { UploadFile } from './types';
import { TIMEOUTS } from './config';

/* ---------------------------- Backend contract ---------------------------- */

export interface UserProfile extends User {
  avatarUrl?: string | null;
  createdAt: string;
}

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/* ------------------------------- Endpoints ------------------------------- */

/** `/api/v1/users/*`. Everything here is about the signed-in user. */
export const userApi = baseApi.injectEndpoints({
  endpoints: build => ({
    getMe: build.query<UserProfile, void>({
      query: () => '/users/me',
      providesTags: ['User'],
    }),

    updateMe: build.mutation<UserProfile, UpdateProfilePayload>({
      query: payload => ({ url: '/users/me', method: 'PATCH', body: payload }),
      invalidatesTags: ['User'],
    }),

    uploadAvatar: build.mutation<UserProfile, UploadFile>({
      query: file => {
        const body = new FormData();
        body.append('file', file);
        return { url: '/users/me/avatar', method: 'POST', body };
      },
      extraOptions: { timeout: TIMEOUTS.upload },
      invalidatesTags: ['User'],
    }),

    changePassword: build.mutation<void, ChangePasswordPayload>({
      query: payload => ({
        url: '/users/me/password',
        method: 'POST',
        body: payload,
      }),
    }),

    deleteMe: build.mutation<void, void>({
      query: () => ({ url: '/users/me', method: 'DELETE' }),
    }),
  }),
});

export const {
  useGetMeQuery,
  useLazyGetMeQuery,
  useUpdateMeMutation,
  useUploadAvatarMutation,
  useChangePasswordMutation,
  useDeleteMeMutation,
} = userApi;
