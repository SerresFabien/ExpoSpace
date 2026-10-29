-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `usernameKey` VARCHAR(30) NOT NULL,
    `displayName` VARCHAR(60) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `recoveryCodeHash` VARCHAR(191) NOT NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `sessionVersion` INTEGER NOT NULL DEFAULT 1,
    `suspendedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_usernameKey_key`(`usernameKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Exhibition` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` VARCHAR(3000) NOT NULL DEFAULT '',
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 1,
    `coverArtworkId` CHAR(36) NULL,
    `publishedAt` DATETIME(3) NULL,
    `suspendedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Exhibition_coverArtworkId_key`(`coverArtworkId`),
    INDEX `Exhibition_ownerId_idx`(`ownerId`),
    INDEX `Exhibition_status_publishedAt_id_idx`(`status`, `publishedAt` DESC, `id` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Room` (
    `id` CHAR(36) NOT NULL,
    `exhibitionId` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `position` INTEGER NOT NULL,
    `wallColor` VARCHAR(20) NOT NULL DEFAULT 'white',

    UNIQUE INDEX `Room_exhibitionId_position_key`(`exhibitionId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Artwork` (
    `id` CHAR(36) NOT NULL,
    `exhibitionId` CHAR(36) NOT NULL,
    `title` VARCHAR(120) NOT NULL DEFAULT '',
    `artistName` VARCHAR(120) NOT NULL DEFAULT '',
    `description` VARCHAR(3000) NOT NULL DEFAULT '',
    `altText` VARCHAR(300) NOT NULL DEFAULT '',
    `imagePath` VARCHAR(100) NOT NULL,
    `thumbnailPath` VARCHAR(100) NOT NULL,
    `widthPx` INTEGER NOT NULL,
    `heightPx` INTEGER NOT NULL,
    `byteSize` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Artwork_imagePath_key`(`imagePath`),
    UNIQUE INDEX `Artwork_thumbnailPath_key`(`thumbnailPath`),
    INDEX `Artwork_exhibitionId_idx`(`exhibitionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Placement` (
    `id` CHAR(36) NOT NULL,
    `roomId` CHAR(36) NOT NULL,
    `artworkId` CHAR(36) NOT NULL,
    `slotCode` VARCHAR(3) NOT NULL,

    UNIQUE INDEX `Placement_artworkId_key`(`artworkId`),
    UNIQUE INDEX `Placement_roomId_slotCode_key`(`roomId`, `slotCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `sid` VARCHAR(128) NOT NULL,
    `sessionData` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Exhibition` ADD CONSTRAINT `Exhibition_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Exhibition` ADD CONSTRAINT `Exhibition_coverArtworkId_fkey` FOREIGN KEY (`coverArtworkId`) REFERENCES `Artwork`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_exhibitionId_fkey` FOREIGN KEY (`exhibitionId`) REFERENCES `Exhibition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Artwork` ADD CONSTRAINT `Artwork_exhibitionId_fkey` FOREIGN KEY (`exhibitionId`) REFERENCES `Exhibition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Placement` ADD CONSTRAINT `Placement_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Placement` ADD CONSTRAINT `Placement_artworkId_fkey` FOREIGN KEY (`artworkId`) REFERENCES `Artwork`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
