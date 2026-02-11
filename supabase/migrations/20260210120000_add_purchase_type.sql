alter table public.purchases
add column if not exists purchase_type text not null default 'satin_alim'
check (purchase_type in ('satin_alim', 'munchies'));
