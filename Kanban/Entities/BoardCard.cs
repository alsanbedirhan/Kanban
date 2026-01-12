using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class BoardCard
{
    public long Id { get; set; }

    public long BoardColumnId { get; set; }

    public string Desc { get; set; } = null!;

    public bool IsActive { get; set; }

    public long CreatedBy { get; set; }

    public DateTime? CreatedAt { get; set; }

    public int OrderNo { get; set; }

    public virtual BoardColumn BoardColumn { get; set; } = null!;

    public virtual User CreatedByNavigation { get; set; } = null!;
}
