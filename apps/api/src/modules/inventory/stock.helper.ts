import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import type { StockMovementType } from '@prisma/client';

/**
 * Apply a stock change for one product in one warehouse.
 * quantityChange:
 *   positive = add stock
 *   negative = remove stock
 */
export async function applyStockChange(input: {
  warehouseId: string;
  productId: string;
  quantityChange: number;
  type: StockMovementType;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdById?: string | null;
}) {
  if (input.quantityChange === 0) {
    throw badRequest('Quantity change cannot be zero');
  }

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw notFound('Product not found');
  if (!product.trackInventory) {
    throw badRequest(`Product ${product.sku} does not track inventory`);
  }

  const warehouse = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
  if (!warehouse) throw notFound('Warehouse not found');

  // Find or create the stock row for this product + warehouse
  let balance = await prisma.stockBalance.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
  });

  if (!balance) {
    balance = await prisma.stockBalance.create({
      data: {
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantity: 0,
      },
    });
  }

  const nextQty = balance.quantity + input.quantityChange;
  if (nextQty < 0) {
    throw badRequest(
      `Not enough stock for ${product.sku}. On hand: ${balance.quantity}, change: ${input.quantityChange}`,
    );
  }

  const [updatedBalance, movement] = await prisma.$transaction([
    prisma.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: nextQty },
    }),
    prisma.stockMovement.create({
      data: {
        type: input.type,
        warehouseId: input.warehouseId,
        productId: input.productId,
        // store absolute quantity moved for easier reading
        quantity: Math.abs(input.quantityChange),
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
      },
    }),
  ]);

  return { balance: updatedBalance, movement };
}
