/**
 * A serverless handler function that resizes images and caches the optimized version in an S3 bucket
 */
module.exports.handler = async (event) => {
  const path = event.rawPath.replace(/^\//, "");
  const param = {
    type: "webp",
    ...(event.queryStringParameters || {})
  };

  const contentType = {
    webp: 'image/webp',
  }[param.type] || 'image/jpeg';

  const props = {
    path,
    param
  }
  const hash = Buffer.from(JSON.stringify(props)).toString('base64');
  const optimizedPath = `optimized-images/${hash}`;

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.OUTPUT_BUCKET_NAME,
      Key: optimizedPath
    });
    const response = await s3.send(command);

    const str = Buffer.from(await response.Body.transformToByteArray());
    console.log("cache hit");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": response.ContentType
      },
      body: str.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    console.log("cache miss");
  }

  try {
    const getCommand = new GetObjectCommand({
      Bucket: process.env.OUTPUT_BUCKET_NAME,
      Key: path
    });
    const getResponse = await s3.send(getCommand);
    const str = Buffer.from(await getResponse.Body.transformToByteArray());

    let image = sharp(str).resize({
      width: param.width ? parseInt(param.width) : undefined,
      height: param.height ? parseInt(param.height) : undefined,
      fit: param.fit || 'cover',
    })

    if (contentType === 'image/webp') {
      image = image.webp({
        quality: param.quality ? parseInt(param.quality) : 80
      })
    } else {
      image = image.jpeg({
        quality: param.quality ? parseInt(param.quality) : 80
      })
    }

    const buf = await image.toBuffer()

    const putCommand = new PutObjectCommand({
      Bucket: process.env.OUTPUT_BUCKET_NAME,
      Key: optimizedPath,
      Body: buf,
      ContentType: contentType
    })
    await s3.send(putCommand);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType
      },
      body: buf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    console.error(err);
  }

  return {
    statusCode: 404,
    headers: {
    }
  }
}

