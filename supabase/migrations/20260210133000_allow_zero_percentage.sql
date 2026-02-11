alter table public.purchase_splits
drop constraint if exists purchase_splits_percentage_check;

alter table public.purchase_splits
add constraint purchase_splits_percentage_check
check (percentage >= 0 and percentage <= 100);
