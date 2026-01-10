using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class BoardCard
{
    public long Id { get; set; }

    public long BoardId { get; set; }

    public long BoardColumnId { get; set; }

    public string Title { get; set; } = null!;

    public bool IsActive { get; set; }

    public long CreatedBy { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual Board Board { get; set; } = null!;

    public virtual BoardColumn BoardColumn { get; set; } = null!;

    public virtual User CreatedByNavigation { get; set; } = null!;
}
