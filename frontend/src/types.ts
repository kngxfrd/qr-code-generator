export type Subscription = { planId: string; status: string; interval: string | null; currentPeriodEnd: string | null };
export type User = { id: string; name: string; email: string; createdAt: string; subscription: Subscription; staticQrCredits: number };
export type Plan = { id: string; name: string; monthly: number | null; quarterly: number | null; annual: number | null; dynamicCodes: number | null; monthlyScans: number | null; description: string; features: string[] };
export type QRFolder = { id: string; userId: string; name: string; createdAt: string; codeCount: number };
export type QRCodeRecord = { id: string; userId: string; name: string; type: string; payload: string; fields: string[]; svg: string; format: string; design: QRDesign; folderId: string | null; status: 'Active' | 'Paused'; dynamic: boolean; scanCount: number; lastScannedAt: string | null; createdAt: string; updatedAt: string };
export type QRDesign = { foreground: string; background: string; pattern: string; corners: string; frame: string; frameLabel: string; logo: string | null; logoSize: number };
export type QRDraft = { type: string; fields: Record<string, string>; name: string; dynamic: boolean; design: QRDesign; step: number };
export type Analytics = { totalCodes: number; dynamicCodes: number; totalScans: number; dailyScans: { date: string; count: number }[]; countries: { value: string; count: number }[]; devices: { value: string; count: number }[]; recentScans: { id: string; codeId: string; codeName: string; createdAt: string; country: string; device: string }[] };
