import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function listProducts() {
  const resp = await ddb.send(new ScanCommand({ TableName: process.env.PRODUCTS_TABLE }));
  return (resp.Items || []).map(item => ({
    id: item.id,
    name: item.name,
    price: item.price,
    stock: typeof item.stock === "number" ? item.stock
         : typeof item.quantity === "number" ? item.quantity
         : item.inStock !== undefined ? (item.inStock ? 10 : 0)
         : 0,
  }));
}

export async function updateStock(productId, delta) {
  const result = await ddb.send(new UpdateCommand({
    TableName: process.env.PRODUCTS_TABLE,
    Key: { id: productId },
    UpdateExpression: "SET stock = if_not_exists(stock, :zero) + :delta",
    ConditionExpression: "attribute_exists(id)",
    ExpressionAttributeValues: { ":delta": delta, ":zero": 0 },
    ReturnValues: "ALL_NEW",
  }));
  return result.Attributes.stock;
}
