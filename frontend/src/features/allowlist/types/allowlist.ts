export type AllowedRole = 'admin' | 'user';

export type AllowlistEntry = {
  id: number;
  email: string;
  role: AllowedRole;
  immutable: boolean;
  createdAt: string;
  updatedAt: string;
};

