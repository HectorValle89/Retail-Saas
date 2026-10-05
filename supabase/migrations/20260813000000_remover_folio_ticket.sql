-- Remover la columna folio_ticket porque ya no se utiliza en el proyecto
ALTER TABLE captura_publica_registro DROP COLUMN IF EXISTS folio_ticket;
