-- Portes entre salles : chaque salle peut avoir une porte vers la suivante et une vers la précédente, sur l'une des
-- douze places (comme les œuvres). null = porte pas encore placée.
ALTER TABLE `Room` ADD COLUMN `nextDoorSlot` VARCHAR(3) NULL,
    ADD COLUMN `previousDoorSlot` VARCHAR(3) NULL;

-- Comparaison binaire, comme pour Placement_slotCode_known ; les deux portes d'une salle ne partagent pas une place.
ALTER TABLE `Room` ADD CONSTRAINT `Room_nextDoorSlot_known`
  CHECK (`nextDoorSlot` IS NULL OR CAST(`nextDoorSlot` AS BINARY) IN ('N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'S1', 'S2', 'S3', 'W1', 'W2', 'W3'));
ALTER TABLE `Room` ADD CONSTRAINT `Room_previousDoorSlot_known`
  CHECK (`previousDoorSlot` IS NULL OR CAST(`previousDoorSlot` AS BINARY) IN ('N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'S1', 'S2', 'S3', 'W1', 'W2', 'W3'));
ALTER TABLE `Room` ADD CONSTRAINT `Room_doors_distinct`
  CHECK (`nextDoorSlot` IS NULL OR `previousDoorSlot` IS NULL OR `nextDoorSlot` <> `previousDoorSlot`);
