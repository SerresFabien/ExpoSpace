-- Portes libres : une porte se pose sur une place comme une œuvre et mène à n'importe quelle autre salle.
-- Remplace les deux colonnes de la migration « portes » ; les portes déjà posées sont recopiées.

CREATE TABLE `Door` (
    `id` CHAR(36) NOT NULL,
    `roomId` CHAR(36) NOT NULL,
    `slotCode` VARCHAR(3) NOT NULL,
    `targetRoomId` CHAR(36) NOT NULL,

    INDEX `Door_targetRoomId_idx`(`targetRoomId`),
    UNIQUE INDEX `Door_roomId_slotCode_key`(`roomId`, `slotCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Door` ADD CONSTRAINT `Door_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Door` ADD CONSTRAINT `Door_targetRoomId_fkey` FOREIGN KEY (`targetRoomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Même règle que Placement_slotCode_known. « Pas de porte vers sa propre salle » est contrôlé par le service :
-- MariaDB refuse un CHECK sur une colonne de clé étrangère en cascade.
ALTER TABLE `Door` ADD CONSTRAINT `Door_slotCode_known`
  CHECK (CAST(`slotCode` AS BINARY) IN ('N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'S1', 'S2', 'S3', 'W1', 'W2', 'W3'));

-- Reprise des portes existantes : « suivante » et « précédente » dans l'ordre de visite.
INSERT INTO `Door` (`id`, `roomId`, `slotCode`, `targetRoomId`)
SELECT UUID(), r.`id`, r.`nextDoorSlot`, n.`id`
FROM `Room` r JOIN `Room` n ON n.`exhibitionId` = r.`exhibitionId` AND n.`position` = r.`position` + 1
WHERE r.`nextDoorSlot` IS NOT NULL;

INSERT INTO `Door` (`id`, `roomId`, `slotCode`, `targetRoomId`)
SELECT UUID(), r.`id`, r.`previousDoorSlot`, p.`id`
FROM `Room` r JOIN `Room` p ON p.`exhibitionId` = r.`exhibitionId` AND p.`position` = r.`position` - 1
WHERE r.`previousDoorSlot` IS NOT NULL;

ALTER TABLE `Room` DROP CONSTRAINT `Room_nextDoorSlot_known`;
ALTER TABLE `Room` DROP CONSTRAINT `Room_previousDoorSlot_known`;
ALTER TABLE `Room` DROP CONSTRAINT `Room_doors_distinct`;
ALTER TABLE `Room` DROP COLUMN `nextDoorSlot`,
    DROP COLUMN `previousDoorSlot`;
