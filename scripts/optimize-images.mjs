import sharp from "sharp";
// User-supplied photographs; preserve composition and original colors.
await sharp("public/images/avatar-source.png")
  .resize(640)
  .webp({ lossless: true })
  .toFile("public/images/avatar-seamless.webp");
await sharp("public/images/about-friends-source.png")
  .resize({ width: 1400, withoutEnlargement: true })
  .webp({ quality: 90 })
  .toFile("public/images/about-friends-v2.webp");
await sharp("public/images/friends-source.png")
  .resize({ width: 1942, withoutEnlargement: true })
  .webp({ quality: 92 })
  .toFile("public/images/friends.webp");
for (const name of ["original", "chocolate", "matcha", "mixed"]) {
  await sharp(`public/images/${name}-source.png`)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(`public/images/${name}.webp`);
}
await sharp("public/images/home-source.png")
  .resize({ width: 1400, withoutEnlargement: true })
  .webp({ quality: 88 })
  .toFile("public/images/cookies.webp");
await sharp("public/images/avatar-source.png")
  .resize(640)
  .webp({ quality: 88 })
  .toFile("public/images/avatar.webp");
await sharp("public/images/avatar-source.png")
  .extract({ left: 0, top: 135, width: 1080, height: 1080 })
  .resize(96)
  .png()
  .toFile("public/icon.png");
