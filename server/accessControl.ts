import type { WorkspaceAccessRole } from "../drizzle/schema";

export const canManageOperations = (role: WorkspaceAccessRole) => ["owner", "manager", "operator"].includes(role);
export const canManageCustomerRequests = (role: WorkspaceAccessRole) => ["owner", "manager", "customer_requests"].includes(role);
export const canApproveCustomerSupply = (role: WorkspaceAccessRole) => ["owner", "manager"].includes(role);
