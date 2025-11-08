// A more complete upload function
import { google } from 'googleapis';
import { createReadStream } from 'fs';

export async function uploadAndGetLink(imagePath,mimeType='image/jpeg') {

    const auth = new google.auth.GoogleAuth({
        keyFile: 'drive.json',
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const PARENT = "0AK0SoUiSRlY4Uk9PVA";
    const fileMetadata = {
        name: 'backend-image.txt',
        parents: [PARENT]
    };
    const media = {
        mimeType: mimeType,
        body: createReadStream(imagePath),
    };

    const file = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id', // Only need the ID
        supportsAllDrives: true
    });

    const fileId = file.data.id;
    console.log('File Uploaded, ID:', fileId);

    // 3. Set Permissions
    await drive.permissions.create({
        fileId: fileId,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
        supportsAllDrives: true
    });

    const links = {
        shareLink: `https://drive.google.com/file/d/${fileId}/view`,
        directLink: `https://drive.google.com/uc?id=${fileId}`
    };
    return links
}