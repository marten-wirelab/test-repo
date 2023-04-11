/**
Export onesheet data to Excel file
*/

'use strict';

const fs = require("fs")
const { generateXlsx } = require("../lib/generate-xlsx")
const { uploadToBucket } = require("../lib/upload-to-bucket")
const { createSignedLink } = require("../lib/create-signed-link");
const { default: slugify } = require("slugify");
const { prepareDataForExcel } = require("../lib/prepare-data-for-excel");


const messages = {
    400: 'Bad Request',
    403: 'Forbidden',
    500: 'Internal Server Error',
}
const error = code => ({
    statusCode: code,
    body: JSON.stringify(
        {
            message: messages[code] || 'Internal Server Error',
        },
        null,
        2
    ),
})


module.exports.handler = async (event) => {
    const url = event.queryStringParameters?.url
    const dlName = event.queryStringParameters?.filename || "onesheet"
    const regex = process.env.ALLOWED_URL_PATTERN
    const bucket = process.env.OUTPUT_BUCKET_NAME

    if (!url || !regex || !bucket) return error(400)
    if (!url.match(new RegExp(regex))) return error(403)



    const date = new Date().toISOString().replace(/[^\dTZ]/gm, ''); // we will use this
    // to create filename

    const filename = `xlsx-${date}` // you can call this whatever you want
    // but make it unique or else the file
    // will be replaced

    const xlsxPath = `/tmp/${filename}.xlsx`

    const excelData = await prepareDataForExcel(url)
    if (!excelData) return error(500)

    if (!await generateXlsx(excelData, xlsxPath)) return error(500)

    if (!await uploadToBucket(bucket, filename, xlsxPath, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) return error(500)

    fs.unlinkSync(xlsxPath)

    const signedLink = await createSignedLink(bucket, filename, 3600, `${slugify(dlName)}.xlsx`)

    return {
        statusCode: 200,
        body: JSON.stringify(
            {
                signedLink,
            },
            null,
            2
        ),
    };
}
