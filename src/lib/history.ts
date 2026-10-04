import { Prisma } from '@prisma/client';

export async function appendRevision(
  tx: Prisma.TransactionClient,
  tenantId:string,
  entityType:string,
  entityId:string,
  snapshot:unknown,
  changeType:string,
  changedById?:string
){
  const latest=await tx.entityRevision.findFirst({
    where:{tenantId,entityType,entityId},
    orderBy:{version:'desc'},
    select:{version:true}
  });
  return tx.entityRevision.create({
    data:{
      tenantId,entityType,entityId,changeType,changedById,
      version:(latest?.version??0)+1,
      snapshot:snapshot as Prisma.InputJsonValue
    }
  });
}
