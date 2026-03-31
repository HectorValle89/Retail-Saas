-- =====================================================
-- Fix - hash SHA-256 compatible con pgcrypto en schema extensions
-- Objetivo:
--   evitar fallos de audit_log cuando pgcrypto esta
--   instalado fuera de public y digest(...) no resuelve
--   por search_path en tiempo de ejecucion.
-- =====================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.calcular_hash_sha256(payload jsonb)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex');
$$;
