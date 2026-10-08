import type * as React from 'react';
export type Status = 'ativa' | 'pausada' | 'revisao' | 'alerta' | 'erro';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm' }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface StatusBadgeProps { status?: Status; children?: React.ReactNode }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;
export interface ToggleProps { checked?: boolean; label: string; disabled?: boolean; onChange?: (next: boolean) => void }
export declare function Toggle(props: ToggleProps): React.ReactElement;
export interface KpiCardProps { label: string; value: string; delta?: number; goodWhen?: 'up' | 'down'; compare?: string }
export declare function KpiCard(props: KpiCardProps): React.ReactElement;
export interface AccountCardProps { name: string; accountId: string; status?: Status; balance: number; spendToday: number; activeCampaigns: number; result: string; resultLabel?: string; alert?: string; onOpen?: () => void }
export declare function AccountCard(props: AccountCardProps): React.ReactElement;
export interface CampaignRow { id: string; name: string; objective?: string; status: Status; budget: number; spend: number; results: number; edited?: boolean }
export interface CampaignTableProps { rows: CampaignRow[]; onToggle?: (row: CampaignRow, next: boolean) => void; onEditBudget?: (row: CampaignRow) => void }
export declare function CampaignTable(props: CampaignTableProps): React.ReactElement;
export interface BudgetEditorProps { campaign: string; current: number; value?: number; steps?: number[]; onSave?: (value: number) => void; onCancel?: () => void }
export declare function BudgetEditor(props: BudgetEditorProps): React.ReactElement;
export interface Change { what: string; where: string; from: string; to: string }
export interface ConfirmDialogProps { title?: string; changes: Change[]; note?: string; destructive?: boolean; confirmLabel?: string; onConfirm?: () => void; onCancel?: () => void }
export declare function ConfirmDialog(props: ConfirmDialogProps): React.ReactElement;
export interface CommandBarProps { placeholder?: string; suggestions?: string[]; onSubmit?: (text: string) => void }
export declare function CommandBar(props: CommandBarProps): React.ReactElement;
export interface ChatMessageProps { role?: 'user' | 'assistant'; tools?: string[]; children?: React.ReactNode }
export declare function ChatMessage(props: ChatMessageProps): React.ReactElement;
export interface NavItem { id: string; label: string; count?: number | string }
export interface AppNavProps { items: NavItem[]; current?: string; brand?: string; onSelect?: (id: string) => void }
export declare function AppNav(props: AppNavProps): React.ReactElement;
declare global { interface Window { Trafego: { Button: typeof Button; StatusBadge: typeof StatusBadge; Toggle: typeof Toggle; KpiCard: typeof KpiCard; AccountCard: typeof AccountCard; CampaignTable: typeof CampaignTable; BudgetEditor: typeof BudgetEditor; ConfirmDialog: typeof ConfirmDialog; CommandBar: typeof CommandBar; ChatMessage: typeof ChatMessage; AppNav: typeof AppNav; formatBRL: (n: number) => string } } }
