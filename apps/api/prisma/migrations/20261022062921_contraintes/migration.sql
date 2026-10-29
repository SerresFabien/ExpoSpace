-- Contraintes CHECK que Prisma ne sait pas exprimer dans schema.prisma (cahier des charges §9.3), syntaxe MariaDB 10.11.
-- Elles doublent les contrôles des services : même une écriture directe en base ne peut pas casser ces règles.

-- Identifiant normalisé : 3 à 30 caractères, minuscules ASCII, chiffres et underscore (§4.2).
-- Comparaison binaire : avec la collation utf8mb4_unicode_ci (insensible à la casse), REGEXP accepterait des majuscules.
ALTER TABLE `User` ADD CONSTRAINT `User_usernameKey_format` CHECK (CAST(`usernameKey` AS BINARY) REGEXP '^[a-z0-9_]{3,30}$');
ALTER TABLE `User` ADD CONSTRAINT `User_displayName_not_blank` CHECK (CHAR_LENGTH(TRIM(`displayName`)) BETWEEN 1 AND 60);
ALTER TABLE `User` ADD CONSTRAINT `User_sessionVersion_positive` CHECK (`sessionVersion` >= 1);

-- Exposition : titre non vide, version positive, date de publication cohérente avec l'état.
ALTER TABLE `Exhibition` ADD CONSTRAINT `Exhibition_title_not_blank` CHECK (CHAR_LENGTH(TRIM(`title`)) >= 1);
ALTER TABLE `Exhibition` ADD CONSTRAINT `Exhibition_version_positive` CHECK (`version` >= 1);
ALTER TABLE `Exhibition` ADD CONSTRAINT `Exhibition_published_has_date` CHECK (`status` <> 'PUBLISHED' OR `publishedAt` IS NOT NULL);

-- Œuvre : dimensions et taille strictement positives.
ALTER TABLE `Artwork` ADD CONSTRAINT `Artwork_dimensions_positive` CHECK (`widthPx` > 0 AND `heightPx` > 0 AND `byteSize` > 0);

-- Placement : seulement les douze places prédéfinies (packages/shared/src/roomLayout.js).
-- Comparaison binaire : « n1 » ne doit pas être accepté à la place de « N1 ».
ALTER TABLE `Placement` ADD CONSTRAINT `Placement_slotCode_known`
  CHECK (CAST(`slotCode` AS BINARY) IN ('N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'S1', 'S2', 'S3', 'W1', 'W2', 'W3'));
